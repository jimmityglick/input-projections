package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestQueueLifecycle(t *testing.T) {
	t.Chdir("..") // The service launches from the repository root.
	path := filepath.Join(t.TempDir(), "demo.sqlite3")
	db, err := openStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { db.Close() }()
	api := queueAPI(db)
	request := func(method, tag string, rows []item, want int) *httptest.ResponseRecorder {
		t.Helper()
		b, err := json.Marshal(rows)
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(method, "/api/work-queue", bytes.NewReader(b))
		req.Header.Set("If-Match", tag)
		w := httptest.NewRecorder()
		api.ServeHTTP(w, req)
		if w.Code != want {
			t.Fatalf("%s: got %d (%s), want %d", method, w.Code, w.Body.String(), want)
		}
		return w
	}
	makeRow := func(key, code string) item {
		return item{key, map[string]any{
			"id": code, "title": "Investigate", "status": "new", "priority": 1, "owner_id": "user_000", "team_id": "team_ENG",
			"details": map[string]any{"kind": "bug", "data": map[string]any{"severity": "p0", "component": "comp_api", "repro": true}},
		}}
	}
	rows := []item{makeRow("00000000-0000-4000-8000-000000000001", "WI-0001"), makeRow("00000000-0000-4000-8000-000000000002", "WI-0002")}
	get := func() *httptest.ResponseRecorder { return request(http.MethodGet, "", nil, 200) }
	put := func(tag string, want int) *httptest.ResponseRecorder { return request(http.MethodPut, tag, rows, want) }
	base := get().Header().Get("ETag")
	put("", 428)
	rev := put(base, 204).Header().Get("ETag")
	initial := get().Body.String()
	put(base, 412)
	rows[0].Value["title"] = "must roll back"
	rows[1].Value["owner_id"] = "user_001"
	put(rev, 422)
	rows[1].Value["owner_id"] = "user_004"
	rows[1].Value["priority"] = 9
	put(rev, 422)
	rows[1].Value["priority"] = 2
	rows[1].Value["id"] = "WI-0001"
	put(rev, 422)
	if got := get(); got.Body.String() != initial || got.Header().Get("ETag") != rev {
		t.Fatal("failed save changed stored queue")
	}
	rows[1].Value["id"] = "WI-0099"
	rows[0], rows[1] = rows[1], rows[0]
	rev = put(rev, 204).Header().Get("ETag")
	if err = db.Close(); err != nil {
		t.Fatal(err)
	}
	db, err = openStore(path)
	if err != nil {
		t.Fatal(err)
	}
	api = queueAPI(db)
	got := get()
	var loaded []item
	if err = json.Unmarshal(got.Body.Bytes(), &loaded); err != nil {
		t.Fatal(err)
	}
	if got.Header().Get("ETag") != rev || len(loaded) != 2 || loaded[0].Key != rows[0].Key || loaded[0].Value["id"] != "WI-0099" || loaded[0].Value["owner_id"] != "user_004" {
		t.Fatalf("unexpected reopened queue: %s", got.Body.String())
	}
	rows = []item{}
	put(rev, 204)
	if got := get().Body.String(); got != "[]\n" {
		t.Fatalf("expected empty queue, got %s", got)
	}
}
