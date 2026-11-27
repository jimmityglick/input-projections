package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"time"
)

var entityKey = regexp.MustCompile("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

func validate(ctx context.Context, items []item) error {
	if items == nil || len(items) > 500 {
		return rejection("Expected an array of up to 500 work items")
	}
	values := make([]map[string]any, len(items))
	for i, row := range items {
		if !entityKey.MatchString(row.Key) || row.Value == nil {
			return rejection(fmt.Sprintf("Invalid entity key or value at row %d", i+1))
		}
		values[i] = row.Value
	}
	payload, err := json.Marshal(values)
	if err != nil {
		return err
	}
	return validateProjection(ctx, "grid-full-power", payload)
}

func validateProjection(ctx context.Context, fixture string, payload []byte) error {
	cmd := exec.CommandContext(ctx, "node", "backend/validate.cjs", fixture)
	cmd.Stdin = bytes.NewReader(payload)
	cmd.Stderr = os.Stderr
	output, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("projection validator: %w", err)
	}
	var problem *string
	if err = json.Unmarshal(output, &problem); err != nil {
		return err
	}
	if problem != nil {
		return rejection(*problem)
	}
	return nil
}

func queueAPI(db *sql.DB) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/work-queue", func(w http.ResponseWriter, r *http.Request) {
		items, tag, err := readQueue(r.Context(), db)
		if err != nil {
			serverError(w, err)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("ETag", tag)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(items)
	})
	mux.HandleFunc("PUT /api/work-queue", func(w http.ResponseWriter, r *http.Request) {
		base := r.Header.Get("If-Match")
		if base == "" {
			http.Error(w, "Missing queue revision", 428)
			return
		}
		body := http.MaxBytesReader(w, r.Body, 4<<20)
		defer body.Close()
		dec := json.NewDecoder(body)
		dec.DisallowUnknownFields()
		var items []item
		if err := dec.Decode(&items); err != nil || dec.Decode(new(any)) != io.EOF {
			http.Error(w, "Invalid queue document", 400)
			return
		}
		err := validate(r.Context(), items)
		var tag string
		if err == nil {
			tag, err = saveQueue(r.Context(), db, base, items)
		}
		var problem rejection
		switch {
		case errors.Is(err, stale):
			http.Error(w, err.Error(), 412)
		case errors.As(err, &problem):
			http.Error(w, err.Error(), 422)
		case err != nil:
			serverError(w, err)
		default:
			w.Header().Set("ETag", tag)
			w.WriteHeader(http.StatusNoContent)
		}
	})
	return mux
}
func serverError(w http.ResponseWriter, err error) {
	log.Print(err)
	http.Error(w, "Queue service error; see server log", 500)
}
func main() {
	addr := flag.String("listen", "127.0.0.1:5183", "HTTP listen address")
	path := flag.String("db", ".data/work-queue.sqlite3", "SQLite database file")
	flag.Parse()
	if err := os.MkdirAll(filepath.Dir(*path), 0700); err != nil {
		log.Fatal(err)
	}
	db, err := openStore(*path)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err := initializeFestival(db); err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.Handle("/api/festival", festivalAPI(db))
	mux.Handle("/api/", queueAPI(db))
	mux.Handle("/input-projections/", http.StripPrefix("/input-projections/", http.FileServer(http.Dir("renderer/dist"))))
	log.Printf("Serving work queue on %s using %s", *addr, *path)
	log.Fatal((&http.Server{Addr: *addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}).ListenAndServe())
}
