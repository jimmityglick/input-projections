package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"

	_ "github.com/mattn/go-sqlite3"
)

type item struct {
	Key   string         `json:"key"`
	Value map[string]any `json:"value"`
}

type rejection string

func (e rejection) Error() string { return string(e) }

var stale = errors.New("the saved queue changed; reload it before saving again")

func openStore(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite3", path+"?_foreign_keys=on&_busy_timeout=5000&_txlock=immediate")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err = initialize(db); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func initialize(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var version int
	if err = tx.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		return err
	}
	if version == 1 {
		return tx.Commit()
	}
	if version != 0 {
		return fmt.Errorf("unknown queue database version %d", version)
	}
	_, err = tx.Exec(`
 CREATE TABLE users(id TEXT PRIMARY KEY);
 CREATE TABLE teams(id TEXT PRIMARY KEY);
 CREATE TABLE memberships(owner TEXT REFERENCES users,team TEXT REFERENCES teams,PRIMARY KEY(owner,team));
 CREATE TABLE work_items(
   entity_key TEXT PRIMARY KEY, position INTEGER NOT NULL UNIQUE, code TEXT UNIQUE NOT NULL,
   owner TEXT NOT NULL REFERENCES users, team TEXT REFERENCES teams, attributes TEXT NOT NULL,
   FOREIGN KEY(owner,team) REFERENCES memberships(owner,team)
 );
 CREATE TABLE queue(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
 INSERT INTO queue VALUES(1,0);
 PRAGMA user_version=1;`)
	if err != nil {
		return err
	}
	teams := []string{"team_ENG", "team_QAS", "team_DES", "team_OPS"}
	for _, team := range teams {
		if _, err = tx.Exec("INSERT INTO teams VALUES(?)", team); err != nil {
			return err
		}
	}
	for i := 0; i < 12; i++ {
		user := fmt.Sprintf("user_%03d", i)
		if _, err = tx.Exec("INSERT INTO users VALUES(?)", user); err != nil {
			return err
		}
		// Each demo user belongs to their primary team and the next team.
		for _, team := range []string{teams[i%4], teams[(i+1)%4]} {
			if _, err = tx.Exec("INSERT INTO memberships VALUES(?,?)", user, team); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func readQueue(ctx context.Context, db *sql.DB) ([]item, string, error) {
	rows, err := db.QueryContext(ctx, `SELECT revision,entity_key,code,owner,team,attributes
 FROM queue LEFT JOIN work_items ON TRUE ORDER BY position`)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()
	items := []item{}
	var rev int
	for rows.Next() {
		var key, code, owner, team, attributes sql.NullString
		if err = rows.Scan(&rev, &key, &code, &owner, &team, &attributes); err != nil {
			return nil, "", err
		}
		if !key.Valid {
			continue
		}
		var v map[string]any
		if err = json.Unmarshal([]byte(attributes.String), &v); err != nil {
			return nil, "", err
		}
		v["id"] = code.String
		v["owner_id"] = owner.String
		if team.Valid {
			v["team_id"] = team.String
		}
		items = append(items, item{key.String, v})
	}
	return items, strconv.Quote(strconv.Itoa(rev)), rows.Err()
}

func saveQueue(ctx context.Context, db *sql.DB, base string, items []item) (string, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	var revision int
	if err = tx.QueryRowContext(ctx, "SELECT revision FROM queue").Scan(&revision); err != nil {
		return "", err
	}
	if base != strconv.Quote(strconv.Itoa(revision)) {
		return "", stale
	}
	if _, err = tx.ExecContext(ctx, "DELETE FROM work_items"); err != nil {
		return "", err
	}
	codes := map[string]bool{}
	keys := map[string]bool{}
	for i, row := range items {
		code, _ := row.Value["id"].(string)
		owner, _ := row.Value["owner_id"].(string)
		if codes[code] || keys[row.Key] {
			return "", rejection(fmt.Sprintf("Row %d repeats an entity key or work item ID", i+1))
		}
		codes[code] = true
		keys[row.Key] = true
		team := row.Value["team_id"]
		var eligible bool
		err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id=? AND
   (? IS NULL OR EXISTS(SELECT 1 FROM memberships WHERE owner=users.id AND team=?)))`, owner, team, team).Scan(&eligible)
		if err != nil {
			return "", err
		}
		if !eligible {
			return "", rejection(fmt.Sprintf("%s: owner %s is not eligible for team %v", code, owner, team))
		}
		attrs := make(map[string]any, len(row.Value))
		for k, v := range row.Value {
			if k != "id" && k != "owner_id" && k != "team_id" {
				attrs[k] = v
			}
		}
		payload, err := json.Marshal(attrs)
		if err != nil {
			return "", err
		}
		if _, err = tx.ExecContext(ctx, "INSERT INTO work_items VALUES(?,?,?,?,?,?)", row.Key, i, code, owner, team, string(payload)); err != nil {
			return "", err
		}
	}
	if _, err = tx.ExecContext(ctx, "UPDATE queue SET revision=revision+1"); err != nil {
		return "", err
	}
	return strconv.Quote(strconv.Itoa(revision + 1)), tx.Commit()
}
