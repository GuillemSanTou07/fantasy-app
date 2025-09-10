import React, { useEffect, useMemo, useState } from "react";

// ===================== Utilidades =====================
const POS = ["PT", "DF", "MC", "DL"];
const POS_COLORS = { PT: "bg-yellow-400", DF: "bg-blue-500", MC: "bg-green-500", DL: "bg-red-500" };
// Orden lógico de posiciones para ordenación (no visual)
const POS_ORDER = { PT: 0, DF: 1, MC: 2, DL: 3 };
// Orden VISUAL de filas en el campo (arriba → abajo). PT queda abajo.
const DISPLAY_ORDER = ["DL", "MC", "DF", "PT"];

// Formaciones de 5 jugadoras (PT-DF-MC-DL); el primer dígito es 0 ó 1 (portera/no portera)
const FORMATIONS = [
  "0-1-1-3",
  "0-1-2-2",
  "0-1-3-1",
  "0-2-1-2",
  "0-2-2-1",
  "0-3-1-1",
  "1-1-1-2",
  "1-1-2-1",
  "1-2-1-1",
];

function normalizeFormation(f) {
  if (typeof f !== "string") return "1-1-1-2";
  const parts = f.split("-");
  return parts.length === 3 ? `1-${f}` : f; // compat con estados antiguos 3-3-4 etc.
}
function formationToCounts(f) {
  const [pt, d, m, a] = normalizeFormation(f).split("-").map((x) => parseInt(x, 10));
  return { PT: pt || 0, DF: d || 0, MC: m || 0, DL: a || 0 };
}

function pointsColorClass(v) {
  if (v < 0) return "text-red-600";
  if (v === 0) return "text-gray-500";
  if (v <= 5) return "text-orange-500";
  if (v <= 9) return "text-green-600";
  return "text-blue-600";
}

function adjustPoints(pointsMap, id, delta) {
  const current = parseInt(String(pointsMap[id] ?? 0), 10) || 0;
  return { ...pointsMap, [id]: current + delta };
}

const hasRole = (p, role) => (p.roles || []).includes(role);
const primaryPos = (p) => (p.roles && p.roles.length ? p.roles[0] : "DF");

// ===================== Datos iniciales =====================
const INITIAL_PLAYERS = [
  { id: 1, name: "Ari Rodríguez", roles: ["DL"] },
  { id: 2, name: "Paula Díaz", roles: ["MC", "DF"] },
  { id: 3, name: "Ana García", roles: ["DL"] },
  { id: 4, name: "Ana Fernández", roles: ["DF"] },
  { id: 5, name: "Nata Martín", roles: ["MC"] },
  { id: 6, name: "Celia Huon", roles: ["DL", "MC"] },
  { id: 7, name: "Paula Escola", roles: ["DF"] },
  { id: 8, name: "Judith Antón", roles: ["DF"] },
  { id: 9, name: "Noemi Antón", roles: ["DF"] },
  { id: 10, name: "María Alonso", roles: ["PT"] },
  { id: 11, name: "Yaiza García", roles: ["DL"] },
  { id: 12, name: "Andrea Hernández", roles: ["DF", "MC", "DL"] },
  { id: 13, name: "Jasmine Sayagués", roles: ["DF"] },
  { id: 14, name: "Alba Muñiz", roles: ["MC"] },
];

const LS_KEY = "fantasy_amigas_duero_state_v10"; // actualizado

function emptyLineupForFormation(f) {
  const counts = formationToCounts(f);
  const empty = (n) => Array.from({ length: n }, () => null);
  return {
    PT: empty(counts.PT),
    DF: empty(counts.DF),
    MC: empty(counts.MC),
    DL: empty(counts.DL),
  };
}

function defaultParticipants() {
  const formation = "1-1-1-2";
  return Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    name: "",
    formation,
    lineup: emptyLineupForFormation(formation),
    captainId: null,
  }));
}

function defaultState() {
  const formation = "1-1-1-2"; // 5 jugadoras (con portera)
  const counts = formationToCounts(formation);
  const empty = (n) => Array.from({ length: n }, () => null);
  return {
    players: INITIAL_PLAYERS.slice(),
    nextId: 15,
    formation,
    // kept for backwards compatibility (no usado en "Equipos" por defecto)
    lineup: { PT: empty(counts.PT), DF: empty(counts.DF), MC: empty(counts.MC), DL: empty(counts.DL) },
    captainId: null,
    points: Object.fromEntries(INITIAL_PLAYERS.map((p) => [p.id, 0])),
    notPlayed: Object.fromEntries(INITIAL_PLAYERS.map((p) => [p.id, false])),
    // NUEVO: participantes (20 slots)
    participants: defaultParticipants(),
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) || {};

    const ensure = defaultState();
    let players = Array.isArray(parsed.players) ? parsed.players : ensure.players;
    players = players.map((p) => (p.roles ? p : { ...p, roles: p.pos ? [p.pos] : [] }));

    const basePoints = Object.fromEntries(players.map((p) => [p.id, 0]));
    const baseNotPlayed = Object.fromEntries(players.map((p) => [p.id, false]));

    const formation = normalizeFormation(parsed.formation || ensure.formation);
    const counts = formationToCounts(formation);
    const fixLine = (arr, n) => {
      const current = Array.isArray(arr) ? arr.filter((x) => x !== null) : [];
      const trimmed = current.slice(0, n);
      while (trimmed.length < n) trimmed.push(null);
      return trimmed;
    };

    const merged = {
      ...ensure,
      ...parsed,
      players,
      formation,
      points: { ...basePoints, ...(parsed.points || {}) },
      notPlayed: { ...baseNotPlayed, ...(parsed.notPlayed || {}) },
    };

    // lineup legacy fix
    const L = parsed.lineup || ensure.lineup;
    merged.lineup = {
      PT: fixLine(L.PT, counts.PT),
      DF: fixLine(L.DF, counts.DF),
      MC: fixLine(L.MC, counts.MC),
      DL: fixLine(L.DL, counts.DL),
    };

    // participants: merge and normalizar
    const rawParts = Array.isArray(parsed.participants) ? parsed.participants : ensure.participants;
    const parts = rawParts.slice(0, 20);
    // fill missing up to 20
    while (parts.length < 20) parts.push({ id: parts.length + 1, name: "", formation, lineup: emptyLineupForFormation(formation), captainId: null });

    // normalize each participant
    merged.participants = parts.map((pt, idx) => {
      const form = normalizeFormation(pt.formation || formation);
      const countsP = formationToCounts(form);
      const Lp = pt.lineup || emptyLineupForFormation(form);
      const fix = (arr, n) => {
        const current = Array.isArray(arr) ? arr.filter((x) => x !== null) : [];
        const trimmed = current.slice(0, n);
        while (trimmed.length < n) trimmed.push(null);
        return trimmed;
      };
      return {
        id: pt.id ?? idx + 1,
        name: pt.name ?? "",
        formation: form,
        lineup: {
          PT: fix(Lp.PT, countsP.PT),
          DF: fix(Lp.DF, countsP.DF),
          MC: fix(Lp.MC, countsP.MC),
          DL: fix(Lp.DL, countsP.DL),
        },
        captainId: pt.captainId ?? null,
      };
    });

    return merged;
  } catch {
    return defaultState();
  }
}

function saveState(s) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

function usePersistentState() {
  const [state, setState] = useState(loadState);
  useEffect(() => saveState(state), [state]);
  return [state, setState];
}

// ===================== Componentes base =====================
function BadgePos({ pos }) {
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-xs font-semibold shadow ${POS_COLORS[pos]}`}>
      {pos}
    </span>
  );
}

function BadgePosMulti({ roles = [] }) {
  const list = roles.slice(0, 3);
  const has1 = list.length === 1;
  const has2 = list.length === 2;
  const has3 = list.length >= 3;
  return (
    <span className="relative inline-block w-8 h-8">
      {has1 && (
        <span className={`absolute inset-0 rounded-full text-white text-[10px] font-bold flex items-center justify-center shadow ${POS_COLORS[list[0]]}`}>{list[0]}</span>
      )}
      {has2 && (
        <>
          <span className={`absolute left-0 top-0 w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center shadow ${POS_COLORS[list[0]]}`}>{list[0]}</span>
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 text-[10px] font-extrabold text-gray-300 select-none">/</span>
          <span className={`absolute right-0 bottom-0 w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center shadow ${POS_COLORS[list[1]]}`}>{list[1]}</span>
        </>
      )}
      {has3 && (
        <>
          <span className={`absolute left-1/2 -translate-x-1/2 top-0 w-4 h-4 rounded-full text-white text-[8px] font-bold flex items-center justify-center shadow ${POS_COLORS[list[0]]}`}>{list[0]}</span>
          <span className={`absolute left-0 bottom-0 w-4 h-4 rounded-full text-white text-[8px] font-bold flex items-center justify-center shadow ${POS_COLORS[list[1]]}`}>{list[1]}</span>
          <span className={`absolute right-0 bottom-0 w-4 h-4 rounded-full text-white text-[8px] font-bold flex items-center justify-center shadow ${POS_COLORS[list[2]]}`}>{list[2]}</span>
        </>
      )}
    </span>
  );
}

function PlayerCard({ player, points, notPlayed, isCaptain, mvp }) {
  if (!player) return null;
  const showC = !!isCaptain;
  const showStar = !showC && !!mvp; // prioridad C > ★
  return (
    <div className="relative h-28 w-full rounded-2xl bg-white/90 backdrop-blur border border-gray-200 shadow-sm p-3 flex flex-col items-center justify-center gap-1">
      {showC && (
        <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full border border-yellow-500 bg-yellow-300 text-[11px] font-bold flex items-center justify-center shadow" title="Capitana">C</div>
      )}
      {showStar && (
        <div className="absolute -top-2 -right-2">
          <div className="w-7 h-7 rounded-full border-2 border-amber-400 bg-gradient-to-br from-yellow-300 to-amber-400 shadow flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-yellow-700" aria-hidden>
              <path fill="currentColor" d="M12 17.3l-5.09 3 1.36-5.82L3 9.9l5.91-.51L12 3.5l3.09 5.89L21 9.9l-5.27 4.58 1.36 5.82L12 17.3z"/>
            </svg>
          </div>
        </div>
      )}
      <div className="absolute -top-2 -left-2">
        <BadgePosMulti roles={player.roles} />
      </div>
      <div className="text-[15px] font-semibold text-gray-800 text-center leading-tight mt-5">{player.name}</div>
      <div className={`text-sm font-semibold ${notPlayed ? "text-gray-500" : pointsColorClass(points)}`}>{notPlayed ? "No jugó" : `Pts: ${points}`}</div>
    </div>
  );
}

// Campo con grid
function Pitch({ rows }) {
  const GRID_COLS = 12;
  return (
    <div className="w-full rounded-3xl p-4 md:p-6 bg-gradient-to-b from-green-700 to-emerald-800 relative overflow-hidden shadow-inner">
      {/* Líneas del campo */}
      <div className="absolute inset-0 opacity-30" aria-hidden>
        <div className="absolute inset-1 rounded-[28px] border-2 border-white/30" />
        <div className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(to right, rgba(255,255,255,0.18) 0, rgba(255,255,255,0.18) 2px, transparent 2px, transparent 72px)" }} />
        <div className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(to bottom, rgba(255,255,255,0.12) 0, rgba(255,255,255,0.12) 2px, transparent 2px, transparent 110px)" }} />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40" style={{ width: 160, height: 160 }} />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 w-[2px] h-full bg-white/40" />
      </div>
      <div className="relative z-10 flex flex-col gap-5 md:gap-7">
        {rows.map((row, idx) => {
          const count = row.players.length || 1;
          const slotSpan = Math.max(2, Math.floor(GRID_COLS / count));
          const used = Math.min(GRID_COLS, count * slotSpan);
          const remaining = Math.max(0, GRID_COLS - used);
          const lead = Math.floor(remaining / 2);
          const trail = GRID_COLS - used - lead;
          return (
            <div key={idx} className="grid gap-3 grid-cols-12 items-center">
              {lead > 0 && <div style={{ gridColumn: `span ${lead} / span ${lead}` }} />}
              {row.players.map((slot, i) => (
                <div key={i} style={{ gridColumn: `span ${slotSpan} / span ${slotSpan}` }}>
                  <button type="button" onClick={slot.onClick} className={`w-full rounded-2xl p-1 md:p-2 transition ${slot.player ? "hover:scale-[1.02]" : "hover:bg-white/10"}`}>
                    {slot.player ? (
                      <PlayerCard player={slot.player} points={slot.points} notPlayed={slot.notPlayed} isCaptain={slot.isCaptain} mvp={slot.mvp} />
                    ) : (
                      <div className="h-28 rounded-2xl border-2 border-dashed border-white/50 bg-white/10 flex items-center justify-center text-white/90 text-sm">Añadir</div>
                    )}
                  </button>
                </div>
              ))} 
              {trail > 0 && <div style={{ gridColumn: `span ${trail} / span ${trail}` }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-semibold transition border ${active ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"}`}
    >
      {children}
    </button>
  );
}

function ConfirmDialog({ open, title, body, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-5">
        <h4 className="text-lg font-bold mb-2">{title}</h4>
        <p className="text-sm text-gray-600 mb-4">{body}</p>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200">Cancelar</button>
          <button type="button" onClick={onConfirm} className="px-3 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-900">Sí, continuar</button>
        </div>
      </div>
    </div>
  );
}

function FormationPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {FORMATIONS.map((f) => {
        const active = value === f;
        return (
          <button
            key={f}
            type="button"
            className={`px-3 py-1.5 rounded-full border text-sm font-semibold transition ${active ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"}`}
            onClick={() => onChange(f)}
            title={`Formación ${f}`}
          >
            {f}
          </button>
        );
      })}
    </div>
  );
}

// ===================== App principal =====================
export default function AppFantasy() {
  const [state, setState] = usePersistentState();
  const [tab, setTab] = useState("equipos"); // "equipos" | "totw" | "scores" | "clasificacion"
  const [modal, setModal] = useState(null); // { role, index, participantIndex }
  const [confirm, setConfirm] = useState({ open: false, title: "", body: "", onYes: null });
  const [addOpen, setAddOpen] = useState(false);
  const [newPlayer, setNewPlayer] = useState({ name: "", pos: "DF" });

  // Para la pestaña Equipos
  const [selectedParticipant, setSelectedParticipant] = useState(0); // 0..19

  const players = state.players;
  const idToPlayer = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);

  // Puntos del equipo seleccionado (participant) (suma base + bonus capitana)
  function participantPoints(part) {
    if (!part) return 0;
    const fielded = Object.values(part.lineup).flat().filter(Boolean);
    let total = 0;
    for (const id of fielded) {
      if (state.notPlayed[id]) continue;
      const base = state.points[id] || 0;
      const bonus = id === part.captainId ? base : 0; // x2
      total += base + bonus;
    }
    return total;
  }
  function participantAvg(part) {
    if (!part) return 0;
    const ids = Object.values(part.lineup).flat().filter(Boolean).filter((id) => !state.notPlayed[id]);
    if (ids.length === 0) return 0;
    let sum = 0;
    for (const id of ids) {
      const base = state.points[id] || 0;
      const bonus = id === part.captainId ? base : 0;
      sum += base + bonus;
    }
    return Math.round((sum / ids.length) * 10) / 10;
  }

  // Equipo de la semana (Top 5) + MVP (sin cambios)
  const totw = useMemo(() => {
    const scored = players
      .filter((p) => !state.notPlayed[p.id])
      .map((p) => ({ id: p.id, pts: state.points[p.id] || 0 }))
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 5);
    const ids = scored.map((x) => x.id);
    const mvpId = ids[0] || null;
    const total = scored.reduce((acc, x) => acc + x.pts, 0);
    const groups = { PT: [], DF: [], MC: [], DL: [] };
    ids.forEach((id) => {
      const p = idToPlayer[id];
      groups[primaryPos(p)].push(id);
    });
    return { groups, mvpId, total };
  }, [players, state.points, state.notPlayed, idToPlayer]);

  // ======== Acciones ========
  function openSlot(role, index, participantIndex = null) {
    setModal({ role, index, participantIndex });
  }

  function assignToSlotForTarget(id) {
    if (!modal) return;
    const { role, index, participantIndex } = modal;
    if (participantIndex === null) {
      // legacy: edit global lineup (kept for compatibility)
      setState((s) => {
        const lineup = Object.fromEntries(Object.entries(s.lineup).map(([r, arr]) => [r, arr.map((x) => (x === id ? null : x))]));
        lineup[role][index] = id;
        return { ...s, lineup };
      });
    } else {
      // assign in participant's lineup (prevent duplicate in same participant)
      setState((s) => {
        const parts = s.participants.slice();
        const pt = { ...parts[participantIndex] };
        // remove id if already present in other slots of same participant
        pt.lineup = Object.fromEntries(Object.entries(pt.lineup).map(([r, arr]) => [r, arr.map((x) => (x === id ? null : x))]));
        pt.lineup[role] = pt.lineup[role].map((x, i) => (i === index ? id : x));
        parts[participantIndex] = pt;
        return { ...s, participants: parts };
      });
    }
    setModal(null);
  }

  function clearSlotForTarget() {
    if (!modal) return;
    const { role, index, participantIndex } = modal;
    if (participantIndex === null) {
      setState((s) => {
        const lineup = { ...s.lineup };
        lineup[role] = lineup[role].map((x, i) => (i === index ? null : x));
        return { ...s, lineup };
      });
    } else {
      setState((s) => {
        const parts = s.participants.slice();
        const pt = { ...parts[participantIndex] };
        pt.lineup = { ...pt.lineup, [role]: pt.lineup[role].map((x, i) => (i === index ? null : x)) };
        parts[participantIndex] = pt;
        return { ...s, participants: parts };
      });
    }
    setModal(null);
  }

  function changeParticipantFormation(pi, newF) {
    setState((s) => {
      const parts = s.participants.slice();
      const pt = { ...parts[pi] };
      pt.formation = newF;
      pt.lineup = emptyLineupForFormation(newF);
      pt.captainId = null;
      parts[pi] = pt;
      return { ...s, participants: parts };
    });
  }

  function changePoints(id, delta) { setState((s) => ({ ...s, points: adjustPoints(s.points, id, delta) })); }

  function askConfirm(title, body, onYes) { setConfirm({ open: true, title, body, onYes }); }

  function resetPoints() {
    askConfirm("Reiniciar puntos", "Pondrá todos los puntos a 0 y desmarcará 'No jugó' para todas las jugadoras.", () => {
      setConfirm({ open: false, title: "", body: "", onYes: null });
      setState((s) => ({ ...s, points: Object.fromEntries(s.players.map((p) => [p.id, 0])), notPlayed: Object.fromEntries(s.players.map((p) => [p.id, false])) }));
    });
  }

  function addPlayer() {
    const name = newPlayer.name.trim();
    const pos = newPlayer.pos;
    if (!name) return alert("Introduce nombre y apellidos");
    if (!POS.includes(pos)) return alert("Posición inválida");
    setState((s) => {
      const id = s.nextId;
      const player = { id, name, roles: [pos] };
      return {
        ...s,
        players: [...s.players, player],
        nextId: id + 1,
        points: { ...s.points, [id]: 0 },
        notPlayed: { ...s.notPlayed, [id]: false },
      };
    });
    setAddOpen(false);
    setNewPlayer({ name: "", pos: "DF" });
  }

  // ========= Derivados =========
  const currentParticipant = state.participants[selectedParticipant];

  const rowsForParticipant = useMemo(() => {
    const part = currentParticipant;
    if (!part) return [];
    const order = DISPLAY_ORDER.filter((r) => formationToCounts(part.formation)[r] > 0); // orden visual
    return order.map((role) => ({
      title: role,
      players: part.lineup[role].map((id, i) => ({
        player: id ? idToPlayer[id] : null,
        points: id ? state.points[id] : 0,
        notPlayed: id ? state.notPlayed[id] : false,
        isCaptain: id === part.captainId,
        onClick: () => openSlot(role, i, selectedParticipant),
      })),
    }));
  }, [currentParticipant, idToPlayer, state.points, state.notPlayed, selectedParticipant]);

  // ===================== Vistas =====================
  function ViewTOTW() {
    const rows = DISPLAY_ORDER
      .map((role) => ({ title: role, ids: totw.groups[role] }))
      .filter((r) => r.ids.length > 0);

    const rowsData = rows.map((r) => ({
      title: r.title,
      players: r.ids.map((id) => ({
        player: idToPlayer[id],
        points: state.points[id] || 0,
        notPlayed: state.notPlayed[id],
        isCaptain: false,
        mvp: id === totw.mvpId,
        onClick: () => {},
      })),
    }));

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">⭐ Equipo de la Semana</h2>
          <div className="text-sm font-bold text-black">Total: {totw.total}</div>
        </div>
        <Pitch rows={rowsData} />
        {(() => {
          const id = totw.mvpId;
          if (!id) return null;
          const p = idToPlayer[id];
          const pts = state.notPlayed[id] ? 0 : (state.points[id] || 0);
          return (
            <div className="relative rounded-3xl p-6 md:p-8 bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-400 text-white shadow">
              <div className="absolute -top-3 -left-3 w-12 h-12 rounded-full bg-white shadow flex items-center justify-center">
                <div className="w-9 h-9 rounded-full border-2 border-amber-400 bg-gradient-to-br from-yellow-300 to-amber-400 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-yellow-700" aria-hidden>
                    <path fill="currentColor" d="M12 17.3l-5.09 3 1.36-5.82L3 9.9l5.91-.51L12 3.5l3.09 5.89L21 9.9l-5.27 4.58 1.36 5.82L12 17.3z"/>
                  </svg>
                </div>
              </div>
              <div className="flex items-center justify-between gap-6">
                <div>
                  <div className="text-xl font-extrabold">MVP de la Jornada</div>
                  <div className="mt-1 text-2xl md:text-3xl font-black drop-shadow-sm">{p.name}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-white/20 text-white text-xs font-semibold backdrop-blur">
                      <BadgePosMulti roles={p.roles} />
                      <span className={pointsColorClass(pts)}>{pts}</span> puntos
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-5xl md:text-7xl font-black leading-none drop-shadow-sm">{pts}</div>
                  <div className="uppercase tracking-wide text-xs md:text-sm font-semibold opacity-90">PUNTOS</div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  function ViewEquipos() {
    const bench = players.map((p) => ({ id: p.id, p, pts: state.points[p.id] || 0, np: state.notPlayed[p.id] }));

    const part = currentParticipant;

    return (
      <div className="space-y-6">
        <div className="grid md:grid-cols-[minmax(0,720px)_1fr] gap-6 items-start">
          {/* Pitch y controles del participante a la izquierda */}
          <div className="space-y-4">
            <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="text-sm font-semibold text-gray-800">Participante</div>
                  <select value={selectedParticipant} onChange={(e) => setSelectedParticipant(Number(e.target.value))} className="rounded-full border px-3 py-1 text-sm">
                    {state.participants.map((p, idx) => (
                      <option key={p.id} value={idx}>Slot {String(idx + 1).padStart(2, "0")} {p.name ? `— ${p.name}` : ""}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-sm text-gray-500">Puntos: <span className="font-bold text-black">{participantPoints(part)}</span></div>
                  <div className="text-sm text-gray-500">Media: <span className="font-extrabold">{participantAvg(part)}</span></div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-4 items-start">
                <div>
                  <div className="mb-2 text-sm text-gray-600">Nombre del participante</div>
                  <input value={part.name} onChange={(e) => {
                    const val = e.target.value;
                    setState((s) => {
                      const parts = s.participants.slice();
                      parts[selectedParticipant] = { ...parts[selectedParticipant], name: val };
                      return { ...s, participants: parts };
                    });
                  }} className="w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="Ej. María Pérez" />
                </div>

                <div>
                  <div className="mb-2 text-sm text-gray-600">Formación</div>
                  <FormationPicker value={part.formation} onChange={(v) => changeParticipantFormation(selectedParticipant, v)} />
                </div>
              </div>
            </div>

            <Pitch rows={rowsForParticipant} />
          </div>

          {/* Panel derecho con lista de jugadoras (pool) y acciones */}
          <div className="space-y-4">
            <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-800">Pool de jugadoras</span>
                <span className="text-sm text-gray-500">{players.length} jugadoras</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3 max-h-[420px] overflow-auto">
                {bench.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-xl border border-gray-200 p-2">
                    <div className="flex items-center gap-2">
                      <BadgePosMulti roles={b.p.roles} />
                      <div className="text-sm font-medium text-gray-800">{b.p.name}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`text-sm font-semibold ${b.np ? "text-gray-400" : pointsColorClass(b.pts)}`}>{b.np ? "No jugó" : `${b.pts}`}</div>
                      <button type="button" onClick={() => {
                        // asigna la jugadora al primer hueco vacio del mismo rol en el participante
                        const role = b.p.roles[0] || "DF";
                        const part = state.participants[selectedParticipant];
                        // find first null in role, otherwise replace first
                        const idx = part.lineup[role].indexOf(null);
                        const targetIndex = idx >= 0 ? idx : 0;
                        setModal({ role, index: targetIndex, participantIndex: selectedParticipant });
                        // abrir modal para confirmar selección
                      }} className="rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 px-2 py-1 text-sm font-semibold">Editar</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-800">Acciones</span>
              </div>
              <div className="flex flex-col gap-2">
                <div className="text-sm text-gray-600">Cuando recibas el equipo del participante, selecciónalo y completa su alineación.</div>
                <button type="button" onClick={() => {
                  // limpiar participante actual
                  askConfirm("Vaciar equipo", "Se vaciará la alineación del participante seleccionado.", () => {
                    setConfirm({ open: false, title: "", body: "", onYes: null });
                    setState((s) => {
                      const parts = s.participants.slice();
                      parts[selectedParticipant] = { ...parts[selectedParticipant], lineup: emptyLineupForFormation(parts[selectedParticipant].formation), captainId: null };
                      return { ...s, participants: parts };
                    });
                  });
                }} className="rounded-xl border border-gray-300 px-3 py-2 text-sm">Vaciar equipo seleccionado</button>
                <div className="text-xs text-gray-500">Nota: las jugadoras permanecen en el pool global. Puedes reutilizarlas en varios participantes.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function Stepper({ value, disabled, onChange, onInc, onDec, onKeyDown }) {
    const colorCls = pointsColorClass(Number(value) || 0);
    return (
      <div className={`inline-flex items-stretch rounded-lg border overflow-hidden ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
        <button type="button" onClick={onDec} className="px-2 text-sm bg-red-50 hover:bg-red-100 text-red-700 border-r border-red-200">−</button>
        <input type="number" inputMode="numeric" className={`w-20 text-center outline-none px-2 font-semibold ${colorCls}`} value={value} onChange={onChange} onKeyDown={onKeyDown} />
        <button type="button" onClick={onInc} className="px-2 text-sm bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-l border-emerald-200">＋</button>
      </div>
    );
  }

  function ViewScores() {
    const [sortKey, setSortKey] = useState("name"); // name | pos | points
    const [sortDir, setSortDir] = useState("asc"); // asc | desc

    const dirMul = sortDir === "asc" ? 1 : -1;
    const sortedPlayers = useMemo(() => {
      const arr = [...players];
      arr.sort((a, b) => {
        if (sortKey === "name") return dirMul * a.name.localeCompare(b.name, "es", { sensitivity: "base" });
        if (sortKey === "pos") return dirMul * (POS_ORDER[primaryPos(a)] - POS_ORDER[primaryPos(b)]);
        if (sortKey === "points") return dirMul * ((state.points[a.id] || 0) - (state.points[b.id] || 0));
        return 0;
      });
      return arr;
    }, [players, sortKey, sortDir, state.points]);

    function toggleSort(key) {
      setSortKey((k) => {
        if (k === key) {
          setSortDir((d) => (d === "asc" ? "desc" : "asc"));
          return k;
        }
        setSortDir("asc");
        return key;
      });
    }

    const sortBtn = (key, label) => {
      const active = sortKey === key;
      const arrow = active ? (sortDir === "asc" ? "↑" : "↓") : "";
      return (
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition ${active ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"}`}
          title={`Ordenar por ${label}`}
        >
          {label} {arrow}
        </button>
      );
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">📊 Editor de puntuaciones</h2>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {sortBtn("name", "Nombre")}
            {sortBtn("pos", "Posición")}
            {sortBtn("points", "Puntos")}
            <button type="button" onClick={() => setAddOpen(true)} className="rounded-xl bg-black text-white hover:bg-gray-900 px-3 py-2 text-xs font-semibold">Añadir jugadora</button>
            <button type="button" onClick={resetPoints} className="rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 px-3 py-2 text-sm font-semibold">Reiniciar puntos</button>
          </div>
        </div>

        <div className="overflow-auto rounded-xl border border-gray-200">
          <table className="min-w-full bg-white">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500">
                <th className="p-3">Pos</th>
                <th className="p-3">Nombre</th>
                <th className="p-3">No jugó</th>
                <th className="p-3">Puntos</th>
                <th className="p-3">Eliminar</th>
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3"><BadgePosMulti roles={p.roles} /></td>
                  <td className="p-3 text-sm font-medium text-gray-800">{p.name}</td>
                  <td className="p-3"><input type="checkbox" checked={state.notPlayed[p.id]} onChange={(e) => setState((s) => ({ ...s, notPlayed: { ...s.notPlayed, [p.id]: e.target.checked } }))} /></td>
                  <td className="p-3">
                    <Stepper
                      value={state.points[p.id]}
                      disabled={state.notPlayed[p.id]}
                      onChange={(e) => setState((s) => ({ ...s, points: { ...s.points, [p.id]: parseInt(e.target.value || "0", 10) } }))}
                      onInc={() => changePoints(p.id, +1)}
                      onDec={() => changePoints(p.id, -1)}
                      onKeyDown={(e) => { if (e.key === "ArrowUp") { e.preventDefault(); changePoints(p.id, +1); } if (e.key === "ArrowDown") { e.preventDefault(); changePoints(p.id, -1); } }}
                    />
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() =>
                        setConfirm({
                          open: true,
                          title: "Eliminar jugadora",
                          body: `¿Eliminar a ${p.name}?`,
                          onYes: () => {
                            setConfirm({ open: false, title: "", body: "", onYes: null });
                            setState((s) => {
                              const players = s.players.filter((x) => x.id !== p.id);
                              const lineup = Object.fromEntries(Object.entries(s.lineup).map(([r, arr]) => [r, arr.map((x) => (x === p.id ? null : x))]));
                              // remove from participants lineups too
                              const participants = s.participants.map((pt) => {
                                const newLp = Object.fromEntries(Object.entries(pt.lineup).map(([r, arr]) => [r, arr.map((x) => (x === p.id ? null : x))]));
                                const captainId = pt.captainId === p.id ? null : pt.captainId;
                                return { ...pt, lineup: newLp, captainId };
                              });
                              const captainId = s.captainId === p.id ? null : s.captainId;
                              const { [p.id]: _pp, ...points } = s.points;
                              const { [p.id]: _pn, ...notPlayed } = s.notPlayed;
                              return { ...s, players, lineup, captainId, points, notPlayed, participants };
                            });
                          },
                        })
                      }
                      title="Eliminar"
                      className="group w-9 h-9 rounded-md border border-gray-300 hover:bg-red-50 transition-transform hover:scale-110 flex items-center justify-center"
                    >
                      <svg viewBox="0 0 24 24" className="w-5 h-5 text-gray-700 group-hover:text-red-600 transition-colors" aria-hidden>
                        <path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 7h2v8h-2v-8zm4 0h2v8h-2v-8zM7 10h2v8H7v-8z"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function ViewClasificacion() {
    // construir clasificación: nombre + puntos por participante
    const table = state.participants.map((pt) => {
      const pts = participantPoints(pt);
      const avg = participantAvg(pt);
      const filledCount = Object.values(pt.lineup).flat().filter(Boolean).length;
      return { id: pt.id, name: pt.name || `Slot ${pt.id}`, pts, avg, filledCount };
    }).sort((a, b) => b.pts - a.pts);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">🏆 Clasificación</h2>
          <div className="text-sm text-gray-600">Ordenada por puntos.</div>
        </div>

        <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm overflow-auto">
          <table className="min-w-full">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500">
                <th className="p-3">Pos</th>
                <th className="p-3">Participante</th>
                <th className="p-3">Puntos</th>
                <th className="p-3">Media</th>
                <th className="p-3">Jugadoras puestas</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row, i) => (
                <tr key={row.id} className="border-t">
                  <td className="p-3 text-sm font-bold">{i + 1}</td>
                  <td className="p-3 text-sm font-medium">{row.name}</td>
                  <td className="p-3 text-sm font-extrabold">{row.pts}</td>
                  <td className="p-3 text-sm">{row.avg}</td>
                  <td className="p-3 text-sm text-gray-600">{row.filledCount}/5</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ===================== Render =====================
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <header className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Fantasy – Amigos del Duero</h1>
          <nav className="flex items-center gap-2 flex-wrap">
            <TabButton active={tab === "equipos"} onClick={() => setTab("equipos")}>⚽ Equipos</TabButton>
            <TabButton active={tab === "totw"} onClick={() => setTab("totw")}>⭐ Equipo de la Semana</TabButton>
            <TabButton active={tab === "scores"} onClick={() => setTab("scores")}>📊 Editor de puntuaciones</TabButton>
            <TabButton active={tab === "clasificacion"} onClick={() => setTab("clasificacion")}>🏆 Clasificación</TabButton>
          </nav>
        </header>

        {tab === "equipos" && <ViewEquipos />}
        {tab === "totw" && <ViewTOTW />}
        {tab === "scores" && <ViewScores />}
        {tab === "clasificacion" && <ViewClasificacion />}
      </div>

      {/* Modal selección de hueco (ahora soporta participanteIndex) */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModal(null)} />
          <div className="relative w-full md:max-w-xl bg-white rounded-t-3xl md:rounded-2xl shadow-xl p-4 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold">Selecciona {modal.role} {modal.participantIndex !== null ? `(Slot ${modal.participantIndex + 1})` : ""}</h3>
              <button type="button" onClick={() => setModal(null)} className="rounded-full px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200">Cerrar</button>
            </div>

            {/* Cabecera con jugadora del hueco + botón C para capitana */}
            {(() => {
              const pi = modal.participantIndex;
              const id = (pi === null) ? state.lineup[modal.role][modal.index] : state.participants[pi].lineup[modal.role][modal.index];
              if (!id) return null;
              const p = idToPlayer[id];
              const isCap = (pi === null) ? state.captainId === id : state.participants[pi].captainId === id;
              return (
                <div className="mb-3 flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex items-center gap-2"><BadgePosMulti roles={p.roles} /><div className="text-sm font-medium">{p.name}</div></div>
                  <button
                    type="button"
                    onClick={() => {
                      if (pi === null) {
                        setState((s) => ({ ...s, captainId: isCap ? null : id }));
                      } else {
                        setState((s) => {
                          const parts = s.participants.slice();
                          const pt = { ...parts[pi] };
                          pt.captainId = isCap ? null : id;
                          parts[pi] = pt;
                          return { ...s, participants: parts };
                        });
                      }
                    }}
                    className={`${"w-8 h-8 rounded-full border text-xs font-bold"} ${isCap ? "bg-yellow-300 border-yellow-500" : "bg-white border-gray-300 hover:bg-yellow-50"}`}
                    title="Marcar como Capitana"
                  >
                    C
                  </button>
                </div>
              );
            })()}

            <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
              {(() => {
                const role = modal.role;
                const pi = modal.participantIndex;
                // candidates = todas las jugadoras de esa posición
                const allCandidates = players.filter((p) => hasRole(p, role));
                let already = new Set();
                if (pi === null) {
                  already = new Set(Object.values(state.lineup).flat().filter(Boolean));
                } else {
                  already = new Set(Object.values(state.participants[pi].lineup).flat().filter(Boolean));
                }
                // permitimos la selección salvo que sea la misma que ya esté en el hueco actual (se sustituye), y evitamos duplicados dentro del mismo equipo
                return allCandidates.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl border p-2">
                    <div className="flex items-center gap-2"><BadgePosMulti roles={p.roles} /><div className="text-sm font-medium">{p.name}</div></div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => assignToSlotForTarget(p.id)}
                        className="rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 px-3 py-1 text-sm font-semibold"
                      >
                        Elegir
                      </button>
                    </div>
                  </div>
                ));
              })()}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button type="button" onClick={clearSlotForTarget} className="rounded-xl bg-gray-100 hover:bg-gray-200 px-3 py-2 text-sm">Vaciar posición</button>
              <div className="text-xs text-gray-500">Selecciona cualquier jugadora del pool.</div>
            </div>
          </div>
        </div>
      )}

      {/* Modal añadir jugadora */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAddOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-5 space-y-3">
            <h3 className="text-lg font-bold">Añadir jugadora</h3>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre y apellidos</label>
              <input className="w-full rounded-lg border border-gray-300 px-3 py-2" value={newPlayer.name} onChange={(e) => setNewPlayer((s) => ({ ...s, name: e.target.value }))} placeholder="Ej. Laura Pérez" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Posición</label>
              <select className="w-full rounded-lg border border-gray-300 px-3 py-2" value={newPlayer.pos} onChange={(e) => setNewPlayer((s) => ({ ...s, pos: e.target.value }))}>
                {POS.map((p) => (<option key={p} value={p}>{p}</option>))}
              </select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAddOpen(false)} className="rounded-lg px-3 py-2 bg-gray-100 hover:bg-gray-200">Cancelar</button>
              <button type="button" onClick={addPlayer} className="rounded-lg px-3 py-2 bg-black text-white hover:bg-gray-900">Añadir</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        body={confirm.body}
        onConfirm={() => confirm.onYes && confirm.onYes()}
        onCancel={() => setConfirm({ open: false, title: "", body: "", onYes: null })}
      />
    </div>
  );
}

// ===================== Tests rápidos en consola (opcionales) =====================
(function runDevTests(){
  try {
    const f1 = formationToCounts("1-1-1-2");
    const f2 = formationToCounts("0-2-2-1");
    const f3 = formationToCounts("1-2-1-1");
    const sum = (o) => o.PT + o.DF + o.MC + o.DL;
    console.assert(sum(f1) === 5 && f1.PT === 1, "formation 1-1-1-2 -> 5 jugadoras con PT");
    console.assert(sum(f2) === 5 && f2.PT === 0, "formation 0-2-2-1 -> 5 jugadoras sin PT");
    console.assert(sum(f3) === 5 && f3.PT === 1, "formation 1-2-1-1 -> 5 jugadoras con PT");

    ["PT","DF","MC","DL"].forEach((k)=>{ if(!(k in POS_COLORS)) throw new Error("Missing POS color: "+k); });

    const pc = (v) => pointsColorClass(v);
    console.assert(pc(-1) === "text-red-600" && pc(0) === "text-gray-500" && pc(3) === "text-orange-500" && pc(8) === "text-green-600" && pc(10) === "text-blue-600", "pointsColorClass ranges");

    const paula = INITIAL_PLAYERS.find(p=>p.id===2);
    console.assert(hasRole(paula, "DF") && hasRole(paula, "MC"), "multiposición Paula Díaz");

    console.log("✅ Tests básicos OK (v10)");
  } catch(e) { console.warn("⚠️ Tests fallaron:", e); }
})();
