package main

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"maps"
	"net/http"
	"slices"
	"sort"
	"strconv"
	"time"
)

//go:embed festival_seed.json
var festivalSeed []byte

func initializeFestival(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	_, err = tx.Exec(`CREATE TABLE IF NOT EXISTS festival_program (
 id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, document TEXT NOT NULL CHECK(json_valid(document)))`)
	if err != nil {
		return err
	}
	_, err = tx.Exec("INSERT INTO festival_program(id,revision,document) VALUES(1,0,?) ON CONFLICT(id) DO NOTHING", string(festivalSeed))
	if err != nil {
		return err
	}
	return tx.Commit()
}

type namedEntity struct {
	ID   string
	Name string
}
type festivalSpeaker struct {
	namedEntity
	Fee       int
	Qualified []string
}
type festivalSession struct {
	Format struct {
		Kind string
		Data struct{ Reserved int }
	}
	namedEntity
	Track, Start, End string
	Seats             int
	Speakers          []string
	Agenda            []struct {
		Label   string
		Minutes int
	}
}
type festivalStage struct {
	namedEntity
	Production int
	Sessions   []festivalSession
}
type festivalRoom struct {
	namedEntity
	Capacity int
	Stages   []festivalStage
}
type festivalVenue struct {
	namedEntity
	Opens, Closes string
	Rooms         []festivalRoom
}
type festival struct {
	Name     string
	Budget   int
	Tracks   []namedEntity
	Speakers []festivalSpeaker
	Venues   []festivalVenue
}
type booking struct{ start, end, title string }

// Projection validation has already checked required fields, bounds, local time order,
// and the HH:MM format. The following rules concern the program as a whole.
func (f festival) check() error {
	ids := map[string]bool{}
	register := func(e namedEntity) error {
		if ids[e.ID] {
			return rejection(fmt.Sprintf("%s: entity ID %q is used more than once", e.Name, e.ID))
		}
		ids[e.ID] = true
		return nil
	}
	tracks := map[string]bool{}
	for _, t := range f.Tracks {
		if err := register(t); err != nil {
			return err
		}
		tracks[t.ID] = true
	}
	speakers := map[string]festivalSpeaker{}
	cost := 0
	for _, s := range f.Speakers {
		if err := register(s.namedEntity); err != nil {
			return err
		}
		for _, t := range s.Qualified {
			if !tracks[t] {
				return rejection(fmt.Sprintf("%s: unknown qualification track %q", s.Name, t))
			}
		}
		speakers[s.ID] = s
		cost += s.Fee
	}
	calendars := map[string][]booking{}
	for _, v := range f.Venues {
		if err := register(v.namedEntity); err != nil {
			return err
		}
		for _, r := range v.Rooms {
			if err := register(r.namedEntity); err != nil {
				return err
			}
			for _, stage := range r.Stages {
				if err := register(stage.namedEntity); err != nil {
					return err
				}
				cost += stage.Production
				for _, s := range stage.Sessions {
					if err := register(s.namedEntity); err != nil {
						return err
					}
					if !tracks[s.Track] {
						return rejection(fmt.Sprintf("%s: unknown track %q", s.Name, s.Track))
					}
					if s.Start < v.Opens || s.End > v.Closes {
						return rejection(fmt.Sprintf("%s must fit within %s opening hours (%s–%s)", s.Name, v.Name, v.Opens, v.Closes))
					}
					if s.Format.Kind == "workshop" && s.Seats > s.Format.Data.Reserved {
						return rejection(fmt.Sprintf("%s offers %d seats but has only %d reserved workshop kits", s.Name, s.Seats, s.Format.Data.Reserved))
					}
					if s.Seats > r.Capacity {
						return rejection(fmt.Sprintf("%s offers %d seats; %s holds %d", s.Name, s.Seats, r.Name, r.Capacity))
					}
					start, err := time.Parse("15:04", s.Start)
					if err != nil {
						return err
					}
					end, err := time.Parse("15:04", s.End)
					if err != nil {
						return err
					}
					minutes := 0
					for _, part := range s.Agenda {
						minutes += part.Minutes
					}
					duration := int(end.Sub(start).Minutes())
					if minutes > duration {
						return rejection(fmt.Sprintf("%s has %d agenda minutes in a %d-minute session", s.Name, minutes, duration))
					}
					slot := booking{s.Start, s.End, s.Name}
					calendars[r.ID] = append(calendars[r.ID], slot)
					for _, id := range s.Speakers {
						person, ok := speakers[id]
						if !ok {
							return rejection(fmt.Sprintf("%s: unknown speaker %q", s.Name, id))
						}
						if !slices.Contains(person.Qualified, s.Track) {
							return rejection(fmt.Sprintf("%s is not qualified for track %s in %s", person.Name, s.Track, s.Name))
						}
						calendars[id] = append(calendars[id], slot)
					}
				}
			}
		}
	}
	if cost > f.Budget {
		return rejection(fmt.Sprintf("Speaker fees and stage production cost $%d; the festival budget is $%d", cost, f.Budget))
	}
	for _, id := range slices.Sorted(maps.Keys(calendars)) {
		slots := calendars[id]
		sort.SliceStable(slots, func(i, j int) bool { return slots[i].start < slots[j].start })
		for i := 1; i < len(slots); i++ {
			if slots[i].start < slots[i-1].end {
				return rejection(fmt.Sprintf("%s is double-booked for %s and %s", id, slots[i-1].title, slots[i].title))
			}
		}
	}
	return nil
}

func saveFestival(ctx context.Context, db *sql.DB, tag string, body []byte) (string, error) {
	if err := validateProjection(ctx, "festival", body); err != nil {
		return "", err
	}
	var f festival
	if err := json.Unmarshal(body, &f); err != nil {
		return "", rejection("Invalid festival program")
	}
	if err := f.check(); err != nil {
		return "", err
	}
	var revision int
	err := db.QueryRowContext(ctx, `UPDATE festival_program SET document=?, revision=revision+1 WHERE id=1 AND printf('"%d"',revision)=? RETURNING revision`, string(body), tag).Scan(&revision)
	if errors.Is(err, sql.ErrNoRows) {
		return "", stale
	}
	return strconv.Quote(strconv.Itoa(revision)), err
}

func festivalAPI(db *sql.DB) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/festival", func(w http.ResponseWriter, r *http.Request) {
		var revision int
		var document string
		if err := db.QueryRowContext(r.Context(), "SELECT revision,document FROM festival_program WHERE id=1").Scan(&revision, &document); err != nil {
			serverError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("ETag", strconv.Quote(strconv.Itoa(revision)))
		io.WriteString(w, document)
	})
	mux.HandleFunc("PUT /api/festival", func(w http.ResponseWriter, r *http.Request) {
		base := r.Header.Get("If-Match")
		if base == "" {
			http.Error(w, "Missing festival revision", 428)
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 4<<20))
		if err != nil {
			http.Error(w, "Invalid or oversized program", 400)
			return
		}
		if !json.Valid(body) {
			http.Error(w, "Invalid JSON", 400)
			return
		}
		tag, err := saveFestival(r.Context(), db, base, body)
		var problem rejection
		switch {
		case errors.Is(err, stale):
			http.Error(w, "The festival program changed", 412)
		case errors.As(err, &problem):
			http.Error(w, problem.Error(), 422)
		case err != nil:
			serverError(w, err)
		default:
			w.Header().Set("ETag", tag)
			w.WriteHeader(http.StatusNoContent)
		}
	})
	return mux
}
