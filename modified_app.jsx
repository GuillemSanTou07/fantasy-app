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

const LS_KEY = "fantasy_amigas_duero_state_v12"; // actualizado para nueva estructura

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

function defaultJornadaData() {
  return {
    participants: [], // array dinámico de participantes
    points: Object.fromEntries(INITIAL_PLAYERS.map((p) => [p.id, 0])),
    notPlayed: Object.fromEntries(INITIAL_PLAYERS.map((p) => [p.id, false])),
  };
}

function defaultState() {
  return {
    players: INITIAL_PLAYERS.slice(),
    nextId: 15,
    currentJornada: 1,
    jornadas: Array.from({ length: 26 }, () => defaultJornadaData()),
    nextParticipantId: 1,
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

    // Migrar jornadas si no existen
    let jornadas = parsed.jornadas;
    if (!Array.isArray(jornadas) || jornadas.length !== 26) {
      jornadas = Array.from({ length: 26 }, (_, idx) => {
        // Si había participants en el formato anterior, migrar solo a jornada 1
        if (idx === 0 && Array.isArray(parsed.participants)) {
          return {
            participants: parsed.participants.slice(),
            points: { ...basePoints, ...(parsed.points || {}) },
            notPlayed: { ...baseNotPlayed, ...(parsed.notPlayed || {}) },
          };
        }
        return defaultJornadaData();
      });
    }

    // Normalizar cada jornada
    jornadas = jornadas.map((jornada) => {
      const normalizedParticipants = (jornada.participants || []).map((pt) => {
        const formation = normalizeFormation(pt.formation || "1-1-1-2");
        const counts = formationToCounts(formation);
        const lineup = pt.lineup || emptyLineupForFormation(formation);
        
        const fixLine = (arr, n) => {
          const current = Array.isArray(arr) ? arr.filter((x) => x !== null) : [];
          const trimmed = current.slice(0, n);
          while (trimmed.length < n) trimmed.push(null);
          return trimmed;
        };

        return {
          id: pt.id ?? 1,
          name: pt.name ?? "",
          formation,
          lineup: {
            PT: fixLine(lineup.PT, counts.PT),
            DF: fixLine(lineup.DF, counts.DF),
            MC: fixLine(lineup.MC, counts.MC),
            DL: fixLine(lineup.DL, counts.DL),
          },
          captainId: pt.captainId ?? null,
        };
      });

      return {
        participants: normalizedParticipants,
        points: { ...basePoints, ...(jornada.points || {}) },
        notPlayed: { ...baseNotPlayed, ...(jornada.notPlayed || {}) },
      };
    });

    return {
      ...ensure,
      ...parsed,
      players,
      currentJornada: parsed.currentJornada || 1,
      jornadas,
      nextParticipantId: parsed.nextParticipantId || 1,
    };
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
  // Hacer grid 3x3
  return (
    <div className="grid grid-cols-3 gap-2">
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
  const [addParticipantOpen, setAddParticipantOpen] = useState(false);
  const [newParticipantName, setNewParticipantName] = useState("");

  // Para la pestaña Equipos
  const [selectedParticipant, setSelectedParticipant] = useState(0);

  const players = state.players;
  const idToPlayer = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  
  // Datos de la jornada actual
  const currentJornadaData = state.jornadas[state.currentJornada - 1];
  const currentPoints = currentJornadaData.points;
  const currentNotPlayed = currentJornadaData.notPlayed;

  // Puntos del equipo seleccionado (participant) (suma base + bonus capitana)
  function participantPoints(part, jornadaData = currentJornadaData) {
    if (!part) return 0;
    const fielded = Object.values(part.lineup).flat().filter(Boolean);
    let total = 0;
    for (const id of fielded) {
      if (jornadaData.notPlayed[id]) continue;
      const base = jornadaData.points[id] || 0;
      const bonus = id === part.captainId ? base : 0; // x2
      total += base + bonus;
    }
    return total;
  }
  function participantAvg(part, jornadaData = currentJornadaData) {
    if (!part) return 0;
    const ids = Object.values(part.lineup).flat().filter(Boolean).filter((id) => !jornadaData.notPlayed[id]);
    if (ids.length === 0) return 0;
    let sum = 0;
    for (const id of ids) {
      const base = jornadaData.points[id] || 0;
      const bonus = id === part.captainId ? base : 0;
      sum += base + bonus;
    }
    return Math.round((sum / ids.length) * 10) / 10;
  }

  // Equipo de la semana (Top 5) + MVP de la jornada actual
  const totw = useMemo(() => {
    const scored = players
      .filter((p) => !currentNotPlayed[p.id])
      .map((p) => ({ id: p.id, pts: currentPoints[p.id] || 0 }))
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
  }, [players, currentPoints, currentNotPlayed, idToPlayer]);

  // ======== Acciones ========
  function openSlot(role, index, participantIndex = null) {
    setModal({ role, index, participantIndex });
  }

  function assignToSlotForTarget(id) {
    if (!modal) return;
    const { role, index, participantIndex } = modal;
    if (participantIndex !== null) {
      // assign in participant's lineup (prevent duplicate in same participant)
      setState((s) => {
        const jornadas = s.jornadas.slice();
        const jornadaData = { ...jornadas[s.currentJornada - 1] };
        const parts = jornadaData.participants.slice();
        const pt = { ...parts[participantIndex] };
        // remove id if already present in other slots of same participant
        pt.lineup = Object.fromEntries(Object.entries(pt.lineup).map(([r, arr]) => [r, arr.map((x) => (x === id ? null : x))]));
        pt.lineup[role] = pt.lineup[role].map((x, i) => (i === index ? id : x));
        parts[participantIndex] = pt;
        jornadaData.participants = parts;
        jornadas[s.currentJornada - 1] = jornadaData;
        return { ...s, jornadas };
      });
    }
    setModal(null);
  }

  function clearSlotForTarget() {
    if (!modal) return;
    const { role, index, participantIndex } = modal;
    if (participantIndex !== null) {
      setState((s) => {
        const jornadas = s.jornadas.slice();
        const jornadaData = { ...jornadas[s.currentJornada - 1] };
        const parts = jornadaData.participants.slice();
        const pt = { ...parts[participantIndex] };
        pt.lineup = { ...pt.lineup, [role]: pt.lineup[role].map((x, i) => (i === index ? null : x)) };
        parts[participantIndex] = pt;
        jornadaData.participants = parts;
        jornadas[s.currentJornada - 1] = jornadaData;
        return { ...s, jornadas };
      });
    }
    setModal(null);
  }

  function changeParticipantFormation(pi, newF) {
    setState((s) => {
      const jornadas = s.jornadas.slice();
      const jornadaData = { ...jornadas[s.currentJornada - 1] };
      const parts = jornadaData.participants.slice();
      const pt = { ...parts[pi] };
      pt.formation = newF;
      pt.lineup = emptyLineupForFormation(newF);
      pt.captainId = null;
      parts[pi] = pt;
      jornadaData.participants = parts;
      jornadas[s.currentJornada - 1] = jornadaData;
      return { ...s, jornadas };
    });
  }

  function changePoints(id, delta) { 
    setState((s) => {
      const jornadas = s.jornadas.slice();
      const jornadaData = { ...jornadas[s.currentJornada - 1] };
      jornadaData.points = adjustPoints(jornadaData.points, id, delta);
      jornadas[s.currentJornada - 1] = jornadaData;
      return { ...s, jornadas };
    });
  }

  function askConfirm(title, body, onYes) { setConfirm({ open: true, title, body, onYes }); }

  function resetPoints() {
    askConfirm("Reiniciar puntos", "Pondrá todos los puntos a 0 y desmarcará 'No jugó' para todas las jugadoras de esta jornada.", () => {
      setConfirm({ open: false, title: "", body: "", onYes: null });
      setState((s) => {
        const jornadas = s.jornadas.slice();
        const jornadaData = { ...jornadas[s.currentJornada - 1] };
        jornadaData.points = Object.fromEntries(s.players.map((p) => [p.id, 0]));
        jornadaData.notPlayed = Object.fromEntries(s.players.map((p) => [p.id, false]));
        jornadas[s.currentJornada - 1] = jornadaData;
        return { ...s, jornadas };
      });
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
      // Añadir jugador a todas las jornadas
      const jornadas = s.jornadas.map((j) => ({
        ...j,
        points: { ...j.points, [id]: 0 },
        notPlayed: { ...j.notPlayed, [id]: false },
      }));
      return {
        ...s,
        players: [...s.players, player],
        nextId: id + 1,
        jornadas,
      };
    });
    setAddOpen(false);
    setNewPlayer({ name: "", pos: "DF" });
  }

  function addParticipant() {
    const name = newParticipantName.trim();
    if (!name) return alert("Introduce el nombre del participante");
    
    setState((s) => {
      const jornadas = s.jornadas.slice();
      const jornadaData = { ...jornadas[s.currentJornada - 1] };
      const formation = "1-1-1-2";
      const newParticipant = {
        id: s.nextParticipantId,
        name,
        formation,
        lineup: emptyLineupForFormation(formation),
        captainId: null,
      };
      jornadaData.participants = [...jornadaData.participants, newParticipant];
      jornadas[s.currentJornada - 1] = jornadaData;
      return { 
        ...s, 
        jornadas,
        nextParticipantId: s.nextParticipantId + 1,
      };
    });
    setAddParticipantOpen(false);
    setNewParticipantName("");
  }

  // ========= Derivados =========
  const currentParticipant = currentJornadaData.participants[selectedParticipant];

  const rowsForParticipant = useMemo(() => {
    const part = currentParticipant;
    if (!part) return [];
    const order = DISPLAY_ORDER.filter((r) => formationToCounts(part.formation)[r] > 0); // orden visual
    return order.map((role) => ({
      title: role,
      players: part.lineup[role].map((id, i) => ({
        player: id ? idToPlayer[id] : null,
        points: id ? currentPoints[id] : 0,
        notPlayed: id ? currentNotPlayed[id] : false,
        isCaptain: id === part.captainId,
        onClick: () => openSlot(role, i, selectedParticipant),
      })),
    }));
  }, [currentParticipant, idToPlayer, currentPoints, currentNotPlayed, selectedParticipant]);

  // ===================== Vistas =====================
  function ViewTOTW() {
    const rows = DISPLAY_ORDER
      .map((role) => ({ title: role, ids: totw.groups[role] }))
      .filter((r) => r.ids.length > 0);

    const rowsData = rows.map((r) => ({
      title: r.title,
      players: r.ids.map((id) => ({
        player: idToPlayer[id],
        points: currentPoints[id] || 0,
        notPlayed: currentNotPlayed[id],
        isCaptain: false,
        mvp: id === totw.mvpId,
        onClick: () => {},
      })),
    }));

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">⭐ Equipo de la Semana - Jornada {state.currentJornada}</h2>
          <div className="text-sm font-bold text-black">Total: {totw.total}</div>
        </div>
        <Pitch rows={rowsData} />
        {(() => {
          const id = totw.mvpId;
          if (!id) return null;
          const p = idToPlayer[id];
          const pts = currentNotPlayed[id] ? 0 : (currentPoints[id] || 0);
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

  // ========= VISTA EQUIPOS =========
  function ViewEquipos() {
    const bench = players.map((p) => ({ id: p.id, p, pts: currentPoints[p.id] || 0, np: currentNotPlayed[p.id] }));
    const part = currentParticipant;

    // Header title: "Participante N — Nombre" (si nombre existe)
    const headerTitle = part ? `${part.name || `Participante ${selectedParticipant + 1}`}` : "";

    return (
      <div className="space-y-6">
        <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="text-sm font-semibold text-gray-800">Jornada</div>
              <select
                value={state.currentJornada}
                onChange={(e) => {
                  setState(s => ({ ...s, currentJornada: Number(e.target.value) }));
                  setSelectedParticipant(0); // Reset participant selection
                }}
                className="rounded-full border px-3 py-1 text-sm"
              >
                {Array.from({ length: 26 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>

              <div className="text-sm font-semibold text-gray-800">Participante</div>
              <select
                value={selectedParticipant}
                onChange={(e) => setSelectedParticipant(Number(e.target.value))}
                className="rounded-full border px-3 py-1 text-sm"
                disabled={currentJornadaData.participants.length === 0}
              >
                {currentJornadaData.participants.map((p, idx) => (
                  <option key={p.id} value={idx}>
                    {p.name || `${idx + 1}`}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setAddParticipantOpen(true)}
                className="rounded-xl bg-green-600 text-white hover:bg-green-700 px-3 py-1 text-sm font-semibold"
              >
                + Añadir participante
              </button>
            </div>

            <div className="flex-1">
              <div className="text-sm text-gray-500">{headerTitle}</div>
            </div>

            {part && (
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-500">Puntos:</div>
                <div className="text-2xl font-extrabold text-black">{participantPoints(part)}</div>

                <div className="text-sm text-gray-500">Media:</div>
                <div className="text-xl font-bold text-gray-900">{participantAvg(part)}</div>
              </div>
            )}
          </div>

          {part && (
            <div className="mt-4 grid md:grid-cols-[1fr_360px] gap-6">
              {/* Campo grande a la izquierda */}
              <div>
                <Pitch rows={rowsForParticipant} />
              </div>

              {/* Panel derecho: formaciones y pool de jugadoras */}
              <div className="space-y-4">
                {/* Selector de formación en 3x3 */}
                <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold">Formaciones</h3>
                  </div>
                  <FormationPicker value={part.formation} onChange={(v) => changeParticipantFormation(selectedParticipant, v)} />
                </div>

                {/* Pool de jugadoras */}
                <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold">Pool de jugadoras</h3>
                    <div className="text-sm text-gray-500">{players.length} jugadoras</div>
                  </div>

                  <div className="max-h-[360px] overflow-auto">
                    <div className="grid gap-2">
                      {bench.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => {
                            // asigna la jugadora al primer hueco vacio del mismo rol en el participante (si no hay hueco, sustituye el primero)
                            const role = b.p.roles[0] || "DF";
                            const idx = part.lineup[role].indexOf(null);
                            const targetIndex = idx >= 0 ? idx : 0;
                            setModal({ role, index: targetIndex, participantIndex: selectedParticipant });
                          }}
                          className="w-full text-left rounded-lg border border-gray-200 px-3 py-2 flex items-center justify-between hover:bg-gray-50 transition"
                        >
                          <div className="flex items-center gap-3">
                            <BadgePosMulti roles={b.p.roles} />
                            <div>
                              <div className="text-sm font-medium text-gray-800">{b.p.name}</div>
                            </div>
                          </div>
                          <div className={`text-sm font-semibold ${b.np ? "text-gray-400" : pointsColorClass(b.pts)}`}>{b.np ? "No jugó" : `${b.pts}`}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!part && currentJornadaData.participants.length === 0 && (
            <div className="mt-4 text-center py-8">
              <p className="text-gray-500 mb-4">No hay participantes en esta jornada.</p>
              <button
                type="button"
                onClick={() => setAddParticipantOpen(true)}
                className="rounded-xl bg-green-600 text-white hover:bg-green-700 px-4 py-2 text-sm font-semibold"
              >
                Añadir primer participante
              </button>
            </div>
          )}
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
        if (sortKey === "points") return dirMul * ((currentPoints[a.id] || 0) - (currentPoints[b.id] || 0));
        return 0;
      });
      return arr;
    }, [players, sortKey, sortDir, currentPoints]);

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
          <h2 className="text-xl font-bold">📊 Editor de puntuaciones - Jornada {state.currentJornada}</h2>
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
                  <td className="p-3">
                    <input 
                      type="checkbox" 
                      checked={currentNotPlayed[p.id]} 
                      onChange={(e) => setState((s) => {
                        const jornadas = s.jornadas.slice();
                        const jornadaData = { ...jornadas[s.currentJornada - 1] };
                        jornadaData.notPlayed = { ...jornadaData.notPlayed, [p.id]: e.target.checked };
                        jornadas[s.currentJornada - 1] = jornadaData;
                        return { ...s, jornadas };
                      })} 
                    />
                  </td>
                  <td className="p-3">
                    <Stepper
                      value={currentPoints[p.id]}
                      disabled={currentNotPlayed[p.id]}
                      onChange={(e) => setState((s) => {
                        const jornadas = s.jornadas.slice();
                        const jornadaData = { ...jornadas[s.currentJornada - 1] };
                        jornadaData.points = { ...jornadaData.points, [p.id]: parseInt(e.target.value || "0", 10) };
                        jornadas[s.currentJornada - 1] = jornadaData;
                        return { ...s, jornadas };
                      })}
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
                              // remove from all jornadas
                              const jornadas = s.jornadas.map((j) => {
                                const participants = j.participants.map((pt) => {
                                  const newLp = Object.fromEntries(Object.entries(pt.lineup).map(([r, arr]) => [r, arr.map((x) => (x === p.id ? null : x))]));
                                  const captainId = pt.captainId === p.id ? null : pt.captainId;
                                  return { ...pt, lineup: newLp, captainId };
                                });
                                const { [p.id]: _pp, ...points } = j.points;
                                const { [p.id]: _pn, ...notPlayed } = j.notPlayed;
                                return { ...j, participants, points, notPlayed };
                              });
                              return { ...s, players, jornadas };
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
    const [classType, setClassType] = useState("jornada"); // "jornada" | "general"
    
    // Clasificación de la jornada actual
    const jornadaTable = currentJornadaData.participants.map((pt) => {
      const pts = participantPoints(pt, currentJornadaData);
      const avg = participantAvg(pt, currentJornadaData);
      return { id: pt.id, name: pt.name || `Participante ${pt.id}`, pts, avg };
    }).sort((a, b) => b.pts - a.pts);

    // Clasificación general (suma de todas las jornadas)
    const generalTable = useMemo(() => {
      // Recopilar todos los participantes únicos por nombre
      const allParticipants = new Map();
      
      state.jornadas.forEach((jornada, jornadaIdx) => {
        jornada.participants.forEach((pt) => {
          const name = pt.name || `Participante ${pt.id}`;
          if (!allParticipants.has(name)) {
            allParticipants.set(name, { name, totalPts: 0, jornadasPlayed: 0 });
          }
          const participant = allParticipants.get(name);
          participant.totalPts += participantPoints(pt, jornada);
          participant.jornadasPlayed += 1;
        });
      });

      return Array.from(allParticipants.values())
        .map(p => ({
          ...p,
          avgPerJornada: p.jornadasPlayed > 0 ? Math.round((p.totalPts / p.jornadasPlayed) * 10) / 10 : 0
        }))
        .sort((a, b) => b.totalPts - a.totalPts);
    }, [state.jornadas]);

    const currentTable = classType === "jornada" ? jornadaTable : generalTable;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">🏆 Clasificación</h2>
          <div className="flex items-center gap-2">
            <TabButton active={classType === "jornada"} onClick={() => setClassType("jornada")}>
              Jornada {state.currentJornada}
            </TabButton>
            <TabButton active={classType === "general"} onClick={() => setClassType("general")}>
              General
            </TabButton>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm overflow-auto">
          <table className="min-w-full">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500">
                <th className="p-3">Pos</th>
                <th className="p-3">Participante</th>
                <th className="p-3">{classType === "jornada" ? "Puntos" : "Puntos totales"}</th>
                <th className="p-3">{classType === "jornada" ? "Media" : "Media por jornada"}</th>
                {classType === "general" && <th className="p-3">Jornadas jugadas</th>}
              </tr>
            </thead>
            <tbody>
              {currentTable.map((row, i) => {
                const isTop3 = i < 3;
                const bg =
                  i === 0 ? "bg-amber-200/70" :
                  i === 1 ? "bg-slate-200/60" :
                  i === 2 ? "bg-orange-200/60" : "bg-white";
                const badge =
                  i === 0 ? "🏅" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
                return (
                  <tr key={row.name} className={`border-t ${bg}`}>
                    <td className="p-3 text-sm font-bold">{i + 1} {badge && <span className="ml-2">{badge}</span>}</td>
                    <td className="p-3 text-sm font-medium">{row.name}</td>
                    <td className="p-3 text-sm font-extrabold">{classType === "jornada" ? row.pts : row.totalPts}</td>
                    <td className="p-3 text-sm">{classType === "jornada" ? row.avg : row.avgPerJornada}</td>
                    {classType === "general" && <td className="p-3 text-sm text-gray-600">{row.jornadasPlayed}</td>}
                  </tr>
                );
              })}
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

      {/* Modal selección de hueco */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModal(null)} />
          <div className="relative w-full md:max-w-xl bg-white rounded-t-3xl md:rounded-2xl shadow-xl p-4 md:p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold">Selecciona {modal.role}</h3>
              <button type="button" onClick={() => setModal(null)} className="rounded-full px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200">Cerrar</button>
            </div>

            {/* Cabecera con jugadora del hueco + botón C para capitana */}
            {(() => {
              const pi = modal.participantIndex;
              const id = (pi === null) ? null : currentJornadaData.participants[pi].lineup[modal.role][modal.index];
              if (!id) return null;
              const p = idToPlayer[id];
              const isCap = currentJornadaData.participants[pi].captainId === id;
              return (
                <div className="mb-3 flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex items-center gap-2"><BadgePosMulti roles={p.roles} /><div className="text-sm font-medium">{p.name}</div></div>
                  <button
                    type="button"
                    onClick={() => {
                      setState((s) => {
                        const jornadas = s.jornadas.slice();
                        const jornadaData = { ...jornadas[s.currentJornada - 1] };
                        const parts = jornadaData.participants.slice();
                        const pt = { ...parts[pi] };
                        pt.captainId = isCap ? null : id;
                        parts[pi] = pt;
                        jornadaData.participants = parts;
                        jornadas[s.currentJornada - 1] = jornadaData;
                        return { ...s, jornadas };
                      });
                    }}
                    className={`w-8 h-8 rounded-full border text-xs font-bold ${isCap ? "bg-yellow-300 border-yellow-500" : "bg-white border-gray-300 hover:bg-yellow-50"}`}
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
                // candidates = todas las jugadoras de esa posición
                const allCandidates = players.filter((p) => hasRole(p, role));
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

      {/* Modal añadir participante */}
      {addParticipantOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAddParticipantOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-5 space-y-3">
            <h3 className="text-lg font-bold">Añadir participante</h3>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre del participante</label>
              <input 
                className="w-full rounded-lg border border-gray-300 px-3 py-2" 
                value={newParticipantName} 
                onChange={(e) => setNewParticipantName(e.target.value)} 
                placeholder="Ej. Juan García" 
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAddParticipantOpen(false)} className="rounded-lg px-3 py-2 bg-gray-100 hover:bg-gray-200">Cancelar</button>
              <button type="button" onClick={addParticipant} className="rounded-lg px-3 py-2 bg-green-600 text-white hover:bg-green-700">Añadir</button>
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

    console.log("✅ Tests básicos OK (v12)");
  } catch(e) { console.warn("⚠ Tests fallaron:", e); }
})();