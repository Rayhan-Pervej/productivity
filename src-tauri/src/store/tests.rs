//! Tests for the store: save/load round trips, soft deletes, the day rollover and reminders.

use chrono::NaiveDate;
use serde_json::{json, Value};

use super::util::parse_day;
use super::*;
use crate::db::open_in_memory;
fn d(s: &str) -> NaiveDate {
    parse_day(s).unwrap()
}

fn block(id: &str, kind: &str, start: f64, end: f64, from_plan: bool) -> Block {
    Block {
        id: id.into(),
        title: format!("Block {id}"),
        area_id: "office".into(),
        kind: kind.into(),
        start,
        end,
        status: "planned".into(),
        from_plan,
        ..Default::default()
    }
}

fn snapshot(day: &str) -> Persisted {
    Persisted {
        version: 3,
        state: State {
            settings: json!({ "name": "Test", "leadMinutes": 5, "reviewAt": 1410, "quietFrom": 30, "quietTo": 420, "timeFormat": "24h" }),
            onboarded: true,
            theme: "dark".into(),
            areas: vec![Area {
                id: "office".into(),
                name: "Office".into(),
                color: "#5B7BB5".into(),
            }],
            templates: vec![Template {
                id: "workday".into(),
                name: "Workday".into(),
                days: "Mon – Fri".into(),
                blocks: vec![TemplateBlock {
                    id: "tb1".into(),
                    title: "Study".into(),
                    area_id: "office".into(),
                    kind: "commitment".into(),
                    start: 1320.0,
                    end: 1380.0,
                }],
            }],
            active_template_id: "workday".into(),
            day_key: day.into(),
            blocks: vec![
                Block {
                    subtasks: vec![Subtask {
                        id: "s1".into(),
                        title: "Step".into(),
                        done: false,
                    }],
                    ..block("b1", "commitment", 1260.0, 1320.0, true)
                },
                block("mine", "commitment", 600.0, 630.0, false),
            ],
            upcoming: vec![Block {
                day_offset: Some(1),
                ..block("later", "commitment", 540.0, 570.0, false)
            }],
            routines: vec![],
            anytime: vec![Task {
                id: "t1".into(),
                title: "Read".into(),
                kind: "flexible".into(),
                ..Default::default()
            }],
            inbox: vec![InboxItem {
                id: "i1".into(),
                title: "Idea".into(),
            }],
            backlog: vec![],
        },
    }
}

#[test]
fn save_then_load_round_trips() {
    let mut conn = open_in_memory();
    save(&mut conn, &snapshot("2026-11-11")).unwrap();
    let v = load(&conn, "2026-11-11").unwrap().unwrap();
    let st = &v["state"];
    assert_eq!(st["blocks"].as_array().unwrap().len(), 2);
    // Blocks come back sorted by time; find ours by id.
    let b1 = st["blocks"]
        .as_array()
        .unwrap()
        .iter()
        .find(|b| b["id"] == "b1")
        .unwrap();
    assert_eq!(b1["subtasks"][0]["title"], "Step");
    assert_eq!(st["blocks"][0]["id"], "mine", "earlier block first");
    assert_eq!(st["upcoming"][0]["id"], "later");
    assert_eq!(st["upcoming"][0]["dayOffset"], 1);
    assert_eq!(st["anytime"][0]["title"], "Read");
    assert_eq!(st["inbox"][0]["title"], "Idea");
    assert_eq!(st["templates"][0]["blocks"][0]["title"], "Study");
    assert_eq!(st["settings"]["name"], "Test");
}

#[test]
fn deleting_in_ui_soft_deletes_and_status_changes_are_logged() {
    let mut conn = open_in_memory();
    let mut snap = snapshot("2026-11-11");
    save(&mut conn, &snap).unwrap();

    snap.state.blocks[0].status = "done".into();
    snap.state.blocks.retain(|b| b.id != "mine");
    save(&mut conn, &snap).unwrap();

    let deleted: bool = conn
        .query_row("SELECT deleted_at IS NOT NULL FROM blocks WHERE id = 'mine'", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert!(deleted, "removed block is soft-deleted, not erased");
    let done_logged: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM activity WHERE action = 'done' AND entity_id = 'b1'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(done_logged, 1);
}

#[test]
fn unchanged_rows_keep_their_timestamp() {
    let mut conn = open_in_memory();
    let snap = snapshot("2026-11-11");
    save(&mut conn, &snap).unwrap();
    let before: i64 = conn
        .query_row("SELECT updated_at FROM blocks WHERE id = 'b1'", [], |r| r.get(0))
        .unwrap();
    std::thread::sleep(std::time::Duration::from_millis(5));
    save(&mut conn, &snap).unwrap();
    let after: i64 = conn
        .query_row("SELECT updated_at FROM blocks WHERE id = 'b1'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(before, after);
}

#[test]
fn new_day_carries_unfinished_and_loads_the_plan() {
    let mut conn = open_in_memory();
    save(&mut conn, &snapshot("2026-11-11")).unwrap(); // a Wednesday

    assert!(ensure_today(&mut conn, d("2026-11-12")).unwrap());
    let v = load(&conn, "2026-11-12").unwrap().unwrap();
    let st = &v["state"];

    // My unfinished block from yesterday went to the backlog; the plan block did not.
    let backlog: Vec<&str> = st["backlog"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["id"].as_str().unwrap())
        .collect();
    assert_eq!(backlog, vec!["mine"]);
    // Today: the Workday plan, plus what I had planned for this day.
    let titles: Vec<&str> = st["blocks"]
        .as_array()
        .unwrap()
        .iter()
        .map(|b| b["title"].as_str().unwrap())
        .collect();
    assert!(titles.contains(&"Study"));
    assert!(titles.contains(&"Block later"));
    // Running it again changes nothing.
    assert!(!ensure_today(&mut conn, d("2026-11-12")).unwrap());
}

#[test]
fn routines_round_trip_and_appear_on_their_weekdays() {
    let mut conn = open_in_memory();
    let mut snap = snapshot("2026-11-11"); // Wednesday
    snap.state.routines = vec![Routine {
        id: "ielts".into(),
        title: "IELTS class".into(),
        area_id: "office".into(),
        start: 1260.0,
        end: 1320.0,
        days: vec![0, 2, 4], // Sun, Tue, Thu
        until: Some("2026-11-17".into()),
        skip_days: vec!["2026-11-15".into()], // removed on Sunday the 15th
    }];
    save(&mut conn, &snap).unwrap();
    let v = load(&conn, "2026-11-11").unwrap().unwrap();
    assert_eq!(v["state"]["routines"][0]["days"], json!([0, 2, 4]));

    // Thursday: the class appears, linked to its routine.
    ensure_today(&mut conn, d("2026-11-12")).unwrap();
    let thu = load(&conn, "2026-11-12").unwrap().unwrap();
    let copies: Vec<&Value> = thu["state"]["blocks"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|b| b["routineId"] == "ielts")
        .collect();
    assert_eq!(copies.len(), 1);
    assert_eq!(copies[0]["title"], "IELTS class");

    // Friday: no class.
    ensure_today(&mut conn, d("2026-11-13")).unwrap();
    let fri = load(&conn, "2026-11-13").unwrap().unwrap();
    assert!(fri["state"]["blocks"]
        .as_array()
        .unwrap()
        .iter()
        .all(|b| b["routineId"] != "ielts"));

    // Sunday 15: a class day, but removed for that day only.
    ensure_today(&mut conn, d("2026-11-15")).unwrap();
    let sun = load(&conn, "2026-11-15").unwrap().unwrap();
    assert!(sun["state"]["blocks"]
        .as_array()
        .unwrap()
        .iter()
        .all(|b| b["routineId"] != "ielts"));
    assert_eq!(sun["state"]["routines"][0]["skipDays"], json!(["2026-11-15"]));

    // Tuesday 17: the last day, still on. Thursday 19: past the end date, gone.
    ensure_today(&mut conn, d("2026-11-17")).unwrap();
    let last = load(&conn, "2026-11-17").unwrap().unwrap();
    assert!(last["state"]["blocks"]
        .as_array()
        .unwrap()
        .iter()
        .any(|b| b["routineId"] == "ielts"));
    ensure_today(&mut conn, d("2026-11-19")).unwrap();
    let after = load(&conn, "2026-11-19").unwrap().unwrap();
    assert!(after["state"]["blocks"]
        .as_array()
        .unwrap()
        .iter()
        .all(|b| b["routineId"] != "ielts"));
    assert_eq!(
        after["state"]["routines"][0]["until"], "2026-11-17",
        "ended repeats are kept, not deleted"
    );
}

#[test]
fn copies_changed_only_this_day_keep_that_flag() {
    let mut conn = open_in_memory();
    let mut snap = snapshot("2026-11-11");
    snap.state.blocks[1].routine_id = Some("r1".into());
    snap.state.blocks[1].detached = true;
    save(&mut conn, &snap).unwrap();
    let v = load(&conn, "2026-11-11").unwrap().unwrap();
    let mine = v["state"]["blocks"]
        .as_array()
        .unwrap()
        .iter()
        .find(|b| b["id"] == "mine")
        .unwrap();
    assert_eq!(mine["detached"], true);
    assert_eq!(mine["routineId"], "r1");
}

#[test]
fn reminders_respect_quiet_hours() {
    assert!(in_quiet_hours(60.0, 30.0, 420.0));
    assert!(!in_quiet_hours(600.0, 30.0, 420.0));
    assert!(in_quiet_hours(1400.0, 1380.0, 420.0)); // crossing midnight
    assert!(in_quiet_hours(100.0, 1380.0, 420.0));
    assert!(!in_quiet_hours(800.0, 1380.0, 420.0));
}

#[test]
fn time_formats() {
    assert_eq!(fmt_time(1290.0, false), "21:30");
    assert_eq!(fmt_time(1290.0, true), "9:30 PM");
    assert_eq!(fmt_time(0.0, true), "12:00 AM");
    assert_eq!(fmt_time(720.0, true), "12:00 PM");
}

#[test]
fn reminders_come_from_stored_tracked_blocks() {
    let mut conn = open_in_memory();
    let far_future = "2099-01-01";
    let mut snap = snapshot(far_future);
    snap.state.blocks.push(block("ctx", "context", 540.0, 1020.0, true));
    save(&mut conn, &snap).unwrap();
    let r = reminders_for_today(&conn, d(far_future)).unwrap();
    // Two tracked blocks: each gets upcoming, starting, ending and (both are over 20 min) a follow-up.
    // Background blocks never remind. Plus the day's two moments.
    for (kind, n) in [
        ("upcoming", 2),
        ("starting", 2),
        ("ending", 2),
        ("followup", 2),
        ("plan", 1),
        ("review", 1),
    ] {
        assert_eq!(count(&r, kind), n, "{kind}");
    }
    assert!(r.iter().all(|x| x.block_id != "ctx"));
    assert!(r.iter().any(|x| x.title == "Time for Office"));
}

fn count(r: &[crate::reminders::Reminder], kind: &str) -> usize {
    r.iter().filter(|x| x.kind == kind).count()
}

#[test]
fn short_blocks_get_no_follow_up() {
    let mut conn = open_in_memory();
    let day = "2099-01-01";
    let mut snap = snapshot(day);
    snap.state.blocks = vec![block("quick", "commitment", 600.0, 615.0, false)];
    save(&mut conn, &snap).unwrap();
    let r = reminders_for_today(&conn, d(day)).unwrap();
    assert_eq!(count(&r, "followup"), 0);
    assert_eq!(count(&r, "starting"), 1);
}

#[test]
fn daily_moments_come_once_a_day_and_can_be_turned_off() {
    let day = "2099-01-01";
    let moments = |settings: Value| {
        let mut conn = open_in_memory();
        let mut snap = snapshot(day);
        snap.state.settings = settings;
        save(&mut conn, &snap).unwrap();
        let r = reminders_for_today(&conn, d(day)).unwrap();
        (count(&r, "plan"), count(&r, "review"))
    };
    let base = json!({ "reviewAt": 1410, "quietFrom": 30, "quietTo": 420 });
    assert_eq!(moments(base.clone()), (1, 1));

    let mut done = base.clone();
    done["lastMorning"] = json!(day);
    done["lastEvening"] = json!(day);
    assert_eq!(moments(done), (0, 0), "already shown today");

    let mut off = base;
    off["planMyDay"] = json!(false);
    off["closeMyDay"] = json!(false);
    assert_eq!(moments(off), (0, 0), "turned off in Settings");
}

#[test]
fn deadlines_dont_notify() {
    // Deadlines are shown in Plan my day each morning, never as a notification.
    let mut conn = open_in_memory();
    let day = "2099-01-01";
    let mut snap = snapshot(day);
    snap.state.anytime = vec![Task {
        id: "today".into(),
        title: "Submit invoice".into(),
        kind: "deadline".into(),
        due: Some(day.into()),
        ..Default::default()
    }];
    save(&mut conn, &snap).unwrap();
    let r = reminders_for_today(&conn, d(day)).unwrap();
    assert!(r.iter().all(|x| x.block_id != "today"));
}
