package main

import (
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestFestivalRules(t *testing.T) {
	for _, tc := range []struct {
		name    string
		edit    func(*festival)
		message string
	}{
		{"workshop kits", func(f *festival) { f.Venues[0].Rooms[0].Stages[0].Sessions[1].Format.Data.Reserved = 20 }, "reserved workshop kits"},
		{"capacity", func(f *festival) { f.Venues[0].Rooms[0].Capacity = 10 }, "holds 10"},
		{"venue hours", func(f *festival) { f.Venues[0].Opens = "10:15" }, "opening hours"},
		{"run of show", func(f *festival) { f.Venues[0].Rooms[0].Stages[0].Sessions[0].Agenda[0].Minutes = 25 }, "35 agenda minutes"},
		{"shared speaker", func(f *festival) {
			s := &f.Venues[1].Rooms[0].Stages[0].Sessions[0]
			s.Start = "10:00"
			s.End = "10:30"
			s.Speakers = []string{"ines"}
		}, "double-booked"},
		{"qualification", func(f *festival) { f.Speakers[0].Qualified = []string{"cities"} }, "not qualified"},
		{"missing speaker", func(f *festival) { f.Venues[0].Rooms[0].Stages[0].Sessions[0].Speakers = []string{"missing"} }, "unknown speaker"},
		{"budget", func(f *festival) { f.Budget = 1 }, "festival budget"},
		{"identity", func(f *festival) { f.Venues[1].ID = f.Venues[0].ID }, "used more than once"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var f festival
			if err := json.Unmarshal(festivalSeed, &f); err != nil {
				t.Fatal(err)
			}
			tc.edit(&f)
			if err := f.check(); err == nil || !strings.Contains(err.Error(), tc.message) {
				t.Fatalf("unexpected rule result: %v", err)
			}
		})
	}
}

func TestFestivalSave(t *testing.T) {
	t.Chdir("..")
	db, err := openStore(filepath.Join(t.TempDir(), "program.sqlite3"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err = initializeFestival(db); err != nil {
		t.Fatal(err)
	}
	api := festivalAPI(db)
	request := func(method, body, tag string, want int) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, "/api/festival", strings.NewReader(body))
		r.Header.Set("If-Match", tag)
		w := httptest.NewRecorder()
		api.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%s: got %d: %s", method, w.Code, w.Body.String())
		}
		return w
	}
	read := request("GET", "", "", 200)
	draft := strings.Replace(read.Body.String(), "Harbour Assembly", "Harbour Sessions", 1)
	tag := request("PUT", draft, read.Header().Get("ETag"), 204).Header().Get("ETag")
	request("PUT", strings.Replace(draft, `"budget": 8500`, `"budget": 1`, 1), tag, 422)
	request("PUT", strings.Replace(draft, `"end": "10:30"`, `"end": "09:30"`, 1), tag, 422)
	if got := request("GET", "", "", 200); got.Body.String() != draft || got.Header().Get("ETag") != tag {
		t.Fatal("rejection altered saved document")
	}
}
