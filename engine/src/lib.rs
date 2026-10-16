//! WASM wrapper over `atomic-movegen` 2.3.0 (DECISIONS.md D1).
//!
//! Minimal surface for the proofdb browser's replay gate
//! (global_proof_store.md §8.3 / BROWSER_BRIEF §8.3): parse a FEN, apply /
//! undo moves by 16-bit `move_code`, and query position facts.
//!
//! Move codes are the raw `atomic_movegen::Move` u16 bit layout
//! (`to_sq:6 | from_sq:6 | type:2 | promotion:2`) — the same encoding the
//! producer stores in `nodes.move_code`.
//!
//! Boards live in a registry keyed by small integer ids; undo states are
//! kept on a per-board stack so a DFS replay walk is
//! apply/recurse/undo-friendly (one `do_move` per edge, one `undo_move` per
//! backtrack — no re-replaying paths from the root).

use std::cell::RefCell;

use atomic_movegen::board::StateInfo;
use atomic_movegen::types::{MoveType, PROMOTION_PIECES};
use atomic_movegen::{Board, Move, MoveList, Outcome, Square};
use wasm_bindgen::prelude::*;

// `Move(u16)` keeps its bits private, so u16 <-> Move goes through the
// public constructors, which encode exactly the producer's `move_code`
// layout (`to_sq:6 | from_sq:6 | type:2 | promotion:2`). Round-trip exact.
fn move_from_bits(bits: u16) -> Move {
    let from = Square::from_u8(((bits >> 6) & 0x3f) as u8);
    let to = Square::from_u8((bits & 0x3f) as u8);
    match (bits >> 12) & 3 {
        1 => Move::make_promotion(from, to, PROMOTION_PIECES[((bits >> 14) & 3) as usize]),
        2 => Move::make_enpassant(from, to),
        3 => Move::make_castling(from, to),
        _ => Move::make_move(from, to),
    }
}

fn move_to_bits(m: Move) -> u16 {
    let base = ((m.from_sq() as u16) << 6) | (m.to_sq() as u16);
    match m.move_type() {
        MoveType::Promotion => {
            let pt = PROMOTION_PIECES
                .iter()
                .position(|&p| p == m.promotion_type())
                .unwrap_or(0) as u16;
            (pt << 14) | (1 << 12) | base
        }
        MoveType::EnPassant => (2 << 12) | base,
        MoveType::Castling => (3 << 12) | base,
        _ => base,
    }
}

fn outcome_str(o: Outcome) -> &'static str {
    match o {
        Outcome::Win => "win",
        Outcome::Loss => "loss",
        _ => "draw",
    }
}

struct Engine {
    board: Box<Board>,
    /// Undo stack: (move_code, state snapshot) pairs, pushed by `apply`,
    /// popped by `undo`. Parallels the DFS descent of the replay walk.
    undo: Vec<(u16, StateInfo)>,
}

thread_local! {
    static REGISTRY: RefCell<Vec<Option<Engine>>> = const { RefCell::new(Vec::new()) };
}

fn with<R>(id: u32, f: impl FnOnce(&mut Engine) -> R) -> Option<R> {
    REGISTRY.with(|reg| {
        let mut reg = reg.borrow_mut();
        reg.get_mut(id as usize).and_then(|slot| slot.as_mut()).map(f)
    })
}

/// Parse `fen` and register the board. Returns the board id, or `Err` with
/// a human-readable message if the FEN is invalid (root parse check e).
#[wasm_bindgen]
pub fn engine_new(fen: &str) -> Result<u32, JsValue> {
    let board =
        Board::from_fen(fen).map_err(|e| JsValue::from_str(&format!("invalid FEN: {e:?}")))?;
    let engine = Engine {
        board: Box::new(board),
        undo: Vec::new(),
    };
    Ok(REGISTRY.with(|reg| {
        let mut reg = reg.borrow_mut();
        // Reuse a freed slot if one exists, else push.
        if let Some(pos) = reg.iter().position(|s| s.is_none()) {
            reg[pos] = Some(engine);
            pos as u32
        } else {
            reg.push(Some(engine));
            (reg.len() - 1) as u32
        }
    }))
}

/// Drop a board and its undo stack. The id becomes reusable.
#[wasm_bindgen]
pub fn engine_free(id: u32) {
    REGISTRY.with(|reg| {
        let mut reg = reg.borrow_mut();
        if let Some(slot) = reg.get_mut(id as usize) {
            *slot = None;
        }
    });
}

/// Advance the board by `move_u16` (a producer `move_code`). The caller is
/// responsible for legality (the replay gate only applies generated legal
/// codes); the move is pushed onto the undo stack.
#[wasm_bindgen]
pub fn engine_apply(id: u32, move_u16: u16) -> Result<(), JsValue> {
    with(id, |e| {
        let m = move_from_bits(move_u16);
        let mut state = StateInfo::new();
        e.board.do_move(m, &mut state);
        e.undo.push((move_u16, state));
    })
    .ok_or_else(|| JsValue::from_str("engine_apply: unknown board id"))?;
    Ok(())
}

/// Undo the most recent `engine_apply` (optionally asserting it was
/// `move_u16`). DFS-friendly backtrack.
#[wasm_bindgen]
pub fn engine_undo(id: u32, move_u16: u16) -> Result<(), JsValue> {
    with(id, |e| {
        if let Some((code, state)) = e.undo.pop() {
            debug_assert_eq!(code, move_u16, "engine_undo out of order");
            e.board.undo_move(move_from_bits(code), &state);
        }
    })
    .ok_or_else(|| JsValue::from_str("engine_undo: unknown board id"))?;
    Ok(())
}

/// Current position as a FEN string.
#[wasm_bindgen]
pub fn engine_fen(id: u32) -> Result<String, JsValue> {
    with(id, |e| e.board.fen())
        .ok_or_else(|| JsValue::from_str("engine_fen: unknown board id"))
}

/// Zobrist hash of the current position (includes the halfmove clock).
#[wasm_bindgen]
pub fn engine_hash(id: u32) -> Result<u64, JsValue> {
    with(id, |e| e.board.hash())
        .ok_or_else(|| JsValue::from_str("engine_hash: unknown board id"))
}

/// `true` iff the game is over in the current position (rule-terminal).
#[wasm_bindgen]
pub fn engine_terminal(id: u32) -> Result<bool, JsValue> {
    with(id, |e| e.board.is_terminal())
        .ok_or_else(|| JsValue::from_str("engine_terminal: unknown board id"))
}

/// Game outcome from the side-to-move perspective: `"win"`, `"loss"`,
/// `"draw"`, or `null` if the game is not over.
#[wasm_bindgen]
pub fn engine_outcome(id: u32) -> Result<Option<String>, JsValue> {
    with(id, |e| e.board.outcome().map(|o| outcome_str(o).to_string()))
        .ok_or_else(|| JsValue::from_str("engine_outcome: unknown board id"))
}

/// Generated legal moves as `move_code` u16 values (rendered as u32 in JS).
#[wasm_bindgen]
pub fn engine_legal(id: u32) -> Result<Vec<u32>, JsValue> {
    with(id, |e| {
        let mut list = MoveList::new();
        atomic_movegen::movegen::generate_legal(&e.board, &mut list);
        list.as_slice().iter().map(|m| move_to_bits(*m) as u32).collect()
    })
    .ok_or_else(|| JsValue::from_str("engine_legal: unknown board id"))
}

/// UCI string of a `move_code` (pure encoding helper; position-independent).
#[wasm_bindgen]
pub fn engine_uci(_id: u32, move_u16: u16) -> Result<String, JsValue> {
    Ok(move_from_bits(move_u16).to_uci())
}

/// Halfmove clock (rule50) of the current position — diagnostic helper.
#[wasm_bindgen]
pub fn engine_rule50(id: u32) -> Result<u32, JsValue> {
    with(id, |e| e.board.rule50() as u32)
        .ok_or_else(|| JsValue::from_str("engine_rule50: unknown board id"))
}
