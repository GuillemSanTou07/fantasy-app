import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import "./App.css";

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

// Campo con grid - MEJORADO PARA RESPONSIVE
function Pitch({ rows }) {
  const GRID_COLS = 12;
  return (
    <div className="w-full max-w-full rounded-3xl p-4 md:p-6 bg-gradient-to-b from-green-700 to-emerald-800 relative overflow-hidden shadow-inner">
      {/* Líneas del campo */}
      <div className="absolute inset-0 opacity-30" aria-hidden>
        <div className="absolute inset-1 rounded-[28px] border-2 border-white/30" />
        <div className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(to right, rgba(255,255,255,0.18) 0, rgba(255,255,255,0.18) 2px, transparent 2px, transparent 72px)" }} />
        <div className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(to bottom, rgba(255,255,255,0.12) 0, rgba(255,255,255,0.12) 2px, transparent 2px, transparent 110px)" }} />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40" style={{ width: 160, height: 160 }} />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 w-[2px] h-full bg-white/40" />
      </div>
      <div className="relative z-10 flex flex-col gap-3 md:gap-5">
        {rows.map((row, idx) => {
          const count = row.players.length || 1;
          const slotSpan = Math.max(2, Math.floor(GRID_COLS / count));
          const used = Math.min(GRID_COLS, count * slotSpan);
          const remaining = Math.max(0, GRID_COLS - used);
          const lead = Math.floor(remaining / 2);
          const trail = GRID_COLS - used - lead;
          return (
            <div key={idx} className="grid gap-2 md:gap-3 grid-cols-12 items-center w-full">
              {lead > 0 && <div style={{ gridColumn: `span ${lead} / span ${lead}` }} />}
              {row.players.map((slot, i) => (
                <div key={i} style={{ gridColumn: `span ${slotSpan} / span ${slotSpan}` }} className="min-w-0">
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
      className={`px-4 py-2 rounded-full text-sm font-semibold transition border whitespace-nowrap ${active ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"}`}
    >
      {children}
    </button>
  );
}

function ConfirmDialog({ open, title, body, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
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
function AppFantasy() {
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
    const fielded = Object.values(part.lineup).flat().filter(Boolean);
    if (fielded.length === 0) return 0;
    let sum = 0;
    for (const id of fielded) {
      const base = jornadaData.points[id] || 0;
      const bonus = id === part.captainId ? base : 0;
      // INCLUIR jugadoras que no jugaron como 0 puntos en la media
      sum += base + bonus;
    }
    return Math.round((sum / fielded.length) * 10) / 10;
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

  // NUEVA FUNCIÓN: Eliminar participante
  function deleteParticipant(participantIndex) {
    askConfirm("Eliminar participante", "¿Estás seguro de que quieres eliminar este participante? Esta acción no se puede deshacer.", () => {
      setState((s) => {
        const jornadas = s.jornadas.slice();
        const jornadaData = { ...jornadas[s.currentJornada - 1] };
        const parts = jornadaData.participants.slice();
        parts.splice(participantIndex, 1);
        jornadaData.participants = parts;
        jornadas[s.currentJornada - 1] = jornadaData;
        
        // Ajustar selectedParticipant si es necesario
        const newSelectedParticipant = participantIndex === 0 ? 0 : Math.max(0, Math.min(selectedParticipant, parts.length - 1));
        
        return { ...s, jornadas };
      });
      
      // Ajustar selectedParticipant después del estado
      const newParticipantCount = state.jornadas[state.currentJornada - 1].participants.length - 1;
      if (selectedParticipant >= newParticipantCount && newParticipantCount > 0) {
        setSelectedParticipant(newParticipantCount - 1);
      } else if (newParticipantCount === 0) {
        setSelectedParticipant(0);
      }
      
      setConfirm({ open: false, title: "", body: "", onYes: null });
    });
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
      <div className="space-y-4 overflow-x-hidden">
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
            <div className="relative rounded-3xl p-6 md:p-8 bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-400 text-white shadow overflow-hidden">
              <div className="absolute -top-2 -left-2 w-16 h-16 rounded-full bg-white shadow flex items-center justify-center">
                <div className="w-12 h-12 rounded-full border-2 border-amber-400 bg-gradient-to-br from-yellow-300 to-amber-400 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-6 h-6 text-yellow-700" aria-hidden>
                    <path fill="currentColor" d="M12 17.3l-5.09 3 1.36-5.82L3 9.9l5.91-.51L12 3.5l3.09 5.89L21 9.9l-5.27 4.58 1.36 5.82L12 17.3z"/>
                  </svg>
                </div>
              </div>
              <div className="flex flex-col md:flex-row items-center justify-between gap-6 pl-6">
                <div className="text-center md:text-left">
                  <div className="text-xl font-extrabold">MVP de la Jornada</div>
                  <div className="mt-1 text-2xl md:text-3xl font-black drop-shadow-sm">{p.name}</div>
                  <div className="mt-2 flex items-center justify-center md:justify-start gap-2">
                    <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-white/20 text-white text-xs font-semibold backdrop-blur">
                      <BadgePosMulti roles={p.roles} />
                      <span className={pointsColorClass(pts)}>{pts}</span> puntos
                    </span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-4xl md:text-6xl font-black drop-shadow-lg">{pts}</div>
                  <div className="text-sm font-semibold opacity-90">PUNTOS</div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  function ViewScores() {
    const [editingPlayer, setEditingPlayer] = useState(null);
    const [tempValue, setTempValue] = useState("");
    
    const positionFiltered = players.filter((p) => hasRole(p, "DL") || hasRole(p, "MC") || hasRole(p, "DF") || hasRole(p, "PT"));
    const sorted = positionFiltered.sort((a, b) => {
      const aPos = POS_ORDER[primaryPos(a)] ?? 999;
      const bPos = POS_ORDER[primaryPos(b)] ?? 999;
      if (aPos !== bPos) return aPos - bPos;
      return a.name.localeCompare(b.name);
    });

    // Manejar entrada manual de puntos
    const handleEditStart = (playerId, currentPoints) => {
      setEditingPlayer(playerId);
      setTempValue(currentPoints.toString());
    };

    const handleEditSave = (playerId) => {
      const newValue = parseInt(tempValue) || 0;
      const currentValue = currentPoints[playerId] || 0;
      const delta = newValue - currentValue;
      
      if (delta !== 0) {
        changePoints(playerId, delta);
      }
      
      setEditingPlayer(null);
      setTempValue("");
    };

    const handleEditCancel = () => {
      setEditingPlayer(null);
      setTempValue("");
    };

    // Componente individual de jugadora
    const PlayerRow = ({ player }) => {
      const points = currentPoints[player.id] || 0;
      const notPlayed = currentNotPlayed[player.id];
      const isEditing = editingPlayer === player.id;

      return (
        <div className="p-4 bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors">
          <div className="flex items-center justify-between gap-4">
            {/* Info de la jugadora */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <BadgePosMulti roles={player.roles} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 truncate">{player.name}</div>
                <div className="text-xs text-gray-500">{player.roles.join(", ")}</div>
              </div>
            </div>

            {/* Controles de puntuación */}
            <div className="flex items-center gap-4 shrink-0">
              {/* Controles rápidos +/- */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => changePoints(player.id, -1)}
                  className="w-8 h-8 rounded-full bg-red-100 hover:bg-red-200 text-red-600 font-bold text-sm flex items-center justify-center transition-colors"
                  disabled={isEditing}
                >
                  −
                </button>
                
                {/* Display/Editor de puntos */}
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={tempValue}
                      onChange={(e) => setTempValue(e.target.value)}
                      className="w-16 px-2 py-1 text-center border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditSave(player.id);
                        if (e.key === 'Escape') handleEditCancel();
                      }}
                    />
                    <button
                      onClick={() => handleEditSave(player.id)}
                      className="text-green-600 hover:text-green-700 text-sm"
                    >
                      ✓
                    </button>
                    <button
                      onClick={handleEditCancel}
                      className="text-red-600 hover:text-red-700 text-sm"
                    >
                      ✗
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleEditStart(player.id, points)}
                    className={`w-16 h-8 text-center font-bold rounded hover:bg-gray-100 transition-colors ${notPlayed ? "text-gray-500" : pointsColorClass(points)}`}
                    title="Click para editar"
                  >
                    {notPlayed ? "−" : points}
                  </button>
                )}
                
                <button
                  type="button"
                  onClick={() => changePoints(player.id, 1)}
                  className="w-8 h-8 rounded-full bg-green-100 hover:bg-green-200 text-green-600 font-bold text-sm flex items-center justify-center transition-colors"
                  disabled={isEditing}
                >
                  +
                </button>
              </div>

              {/* Checkbox "No jugó" */}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={notPlayed}
                  onChange={(e) => {
                    setState((s) => {
                      const jornadas = s.jornadas.slice();
                      const jornadaData = { ...jornadas[s.currentJornada - 1] };
                      jornadaData.notPlayed = { ...jornadaData.notPlayed, [player.id]: e.target.checked };
                      jornadas[s.currentJornada - 1] = jornadaData;
                      return { ...s, jornadas };
                    });
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-1 focus:ring-blue-500"
                  disabled={isEditing}
                />
                <span className="text-gray-600 whitespace-nowrap select-none">No jugó</span>
              </label>

              {/* Botón eliminar */}
              <button
                type="button"
                onClick={() => deletePlayer(player.id)}
                className="w-8 h-8 rounded-full bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center transition-colors"
                title="Eliminar jugadora"
                disabled={isEditing}
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      );
    };

    function deletePlayer(playerId) {
      askConfirm("Eliminar jugadora", "¿Estás seguro de que quieres eliminar esta jugadora? Se eliminará de todos los equipos y jornadas.", () => {
        setState((s) => {
          // Eliminar jugadora de la lista de jugadoras
          const updatedPlayers = s.players.filter(p => p.id !== playerId);
          
          // Eliminar de todas las jornadas (puntos, notPlayed y lineups)
          const updatedJornadas = s.jornadas.map(jornada => ({
            ...jornada,
            points: Object.fromEntries(Object.entries(jornada.points).filter(([id]) => parseInt(id) !== playerId)),
            notPlayed: Object.fromEntries(Object.entries(jornada.notPlayed).filter(([id]) => parseInt(id) !== playerId)),
            participants: jornada.participants.map(participant => ({
              ...participant,
              lineup: Object.fromEntries(
                Object.entries(participant.lineup).map(([position, lineup]) => [
                  position, 
                  lineup.map(id => id === playerId ? null : id)
                ])
              ),
              captainId: participant.captainId === playerId ? null : participant.captainId
            }))
          }));
          
          return {
            ...s,
            players: updatedPlayers,
            jornadas: updatedJornadas
          };
        });
        setConfirm({ open: false, title: "", body: "", onYes: null });
      });
    }

    return (
      <div className="space-y-6 overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">📊 Editor de Puntuaciones</h2>
            <p className="text-sm text-gray-600 mt-1">Jornada {state.currentJornada} • {sorted.length} jugadoras</p>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
          >
            + Añadir jugadora
          </button>
        </div>

        {/* Lista de jugadoras - REDISEÑO COMPLETO */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Header de la tabla */}
          <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
            <div className="flex items-center justify-between text-sm font-semibold text-gray-700">
              <span>Jugadora</span>
              <div className="flex items-center gap-8">
                <span>Puntuación</span>
                <span>Estado</span>
                <span>Acciones</span>
              </div>
            </div>
          </div>
          
          {/* Lista scrolleable sin re-renders */}
          <div className="max-h-[70vh] overflow-y-auto">
            {sorted.map((player) => (
              <PlayerRow key={player.id} player={player} />
            ))}
          </div>
        </div>

        {/* Footer con estadísticas */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-6">
              <span className="text-gray-600">
                <span className="font-semibold text-gray-900">{sorted.filter(p => !currentNotPlayed[p.id]).length}</span> jugaron
              </span>
              <span className="text-gray-600">
                <span className="font-semibold text-gray-900">{sorted.filter(p => currentNotPlayed[p.id]).length}</span> no jugaron
              </span>
            </div>
            <div className="text-gray-600">
              Total puntos: <span className="font-semibold text-gray-900">
                {sorted.reduce((sum, p) => sum + (currentNotPlayed[p.id] ? 0 : (currentPoints[p.id] || 0)), 0)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function ViewClassification() {
    const [classificationMode, setClassificationMode] = useState("general"); // "general" | "jornada"
    const [classificationJornada, setClassificationJornada] = useState(state.currentJornada);
    const [sortBy, setSortBy] = useState("points"); // "points" | "avg" | "jornadas"
    const [sortDirection, setSortDirection] = useState("desc"); // "asc" | "desc"

    // Datos para clasificación general
    const allParticipants = [];
    state.jornadas.forEach((jornadaData, jornadaIdx) => {
      jornadaData.participants.forEach((part) => {
        let existing = allParticipants.find((ap) => ap.name === part.name);
        if (!existing) {
          existing = { name: part.name, jornadas: [], totalPoints: 0, totalAvg: 0, count: 0 };
          allParticipants.push(existing);
        }
        const pts = participantPoints(part, jornadaData);
        const avg = participantAvg(part, jornadaData);
        existing.jornadas[jornadaIdx] = { points: pts, avg };
        existing.totalPoints += pts;
        existing.totalAvg += avg;
        // CONTAR TODAS las jornadas jugadas, incluso con 0 o puntos negativos
        existing.count++;
      });
    });

    allParticipants.forEach((ap) => {
      // CAMBIAR: Media por jornada = puntos totales / jornadas jugadas
      ap.avgOfAvgs = ap.count > 0 ? Math.round((ap.totalPoints / ap.count) * 10) / 10 : 0;
    });

    // Datos para clasificación por jornada específica
    const jornadaParticipants = state.jornadas[classificationJornada - 1].participants.map((part) => ({
      name: part.name,
      points: participantPoints(part, state.jornadas[classificationJornada - 1]),
      avg: participantAvg(part, state.jornadas[classificationJornada - 1])
    }));

    // Función para cambiar ordenación
    const handleSort = (newSortBy) => {
      if (sortBy === newSortBy) {
        setSortDirection(sortDirection === "desc" ? "asc" : "desc");
      } else {
        setSortBy(newSortBy);
        setSortDirection("desc");
      }
    };

    // Ordenar según el criterio seleccionado
    const sortData = (data, mode) => {
      return [...data].sort((a, b) => {
        let valueA, valueB;
        
        if (mode === "general") {
          if (sortBy === "points") {
            valueA = a.totalPoints;
            valueB = b.totalPoints;
          } else if (sortBy === "avg") {
            valueA = a.avgOfAvgs;
            valueB = b.avgOfAvgs;
          } else if (sortBy === "jornadas") {
            valueA = a.count;
            valueB = b.count;
          }
        } else {
          if (sortBy === "points") {
            valueA = a.points;
            valueB = b.points;
          } else if (sortBy === "avg") {
            valueA = a.avg;
            valueB = b.avg;
          }
        }
        
        if (sortDirection === "desc") {
          return valueB - valueA;
        } else {
          return valueA - valueB;
        }
      });
    };

    const displayData = classificationMode === "general" 
      ? sortData(allParticipants, "general")
      : sortData(jornadaParticipants, "jornada");

    // Función para obtener el ícono de ordenación
    const getSortIcon = (column) => {
      if (sortBy !== column) return "↕️";
      return sortDirection === "desc" ? "↓" : "↑";
    };

    // Función para obtener colores de posición
    const getPositionStyle = (index) => {
      if (index === 0) return "bg-gradient-to-r from-yellow-100 to-yellow-200 border-l-4 border-yellow-500";
      if (index === 1) return "bg-gradient-to-r from-gray-100 to-gray-200 border-l-4 border-gray-500";
      if (index === 2) return "bg-gradient-to-r from-orange-100 to-orange-200 border-l-4 border-orange-500";
      if (index < 5) return "bg-gradient-to-r from-green-50 to-green-100";
      return "bg-white hover:bg-gray-50";
    };

    return (
      <div className="space-y-4 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-xl font-bold">🏆 Clasificación</h2>
          <div className="flex flex-wrap items-center gap-2">
            {/* Selector de jornada (solo si está en modo jornada) - MOVIDO A LA IZQUIERDA */}
            {classificationMode === "jornada" && (
              <select
                value={classificationJornada}
                onChange={(e) => setClassificationJornada(parseInt(e.target.value, 10))}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
              >
                {Array.from({ length: 26 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Jornada {i + 1}
                  </option>
                ))}
              </select>
            )}
            
            {/* Selector de modo como botones */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setClassificationMode("general")}
                className={`px-3 py-2 rounded-md text-sm font-semibold transition ${
                  classificationMode === "general" 
                    ? "bg-black text-white" 
                    : "text-gray-700 hover:bg-gray-200"
                }`}
              >
                General
              </button>
              <button
                type="button"
                onClick={() => setClassificationMode("jornada")}
                className={`px-3 py-2 rounded-md text-sm font-semibold transition ${
                  classificationMode === "jornada" 
                    ? "bg-black text-white" 
                    : "text-gray-700 hover:bg-gray-200"
                }`}
              >
                Por Jornada
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
                <tr>
                  <th className="text-left p-3 font-semibold text-gray-700">#</th>
                  <th className="text-left p-3 font-semibold text-gray-700">Participante</th>
                  {classificationMode === "general" ? (
                    <>
                      <th 
                        className="text-center p-3 font-semibold text-gray-700 cursor-pointer hover:bg-blue-100 transition"
                        onClick={() => handleSort("points")}
                      >
                        Puntos Totales {getSortIcon("points")}
                      </th>
                      <th 
                        className="text-center p-3 font-semibold text-gray-700 cursor-pointer hover:bg-blue-100 transition"
                        onClick={() => handleSort("avg")}
                      >
                        Media por Jornada {getSortIcon("avg")}
                      </th>
                      <th 
                        className="text-center p-3 font-semibold text-gray-700 cursor-pointer hover:bg-blue-100 transition"
                        onClick={() => handleSort("jornadas")}
                      >
                        Jornadas Jugadas {getSortIcon("jornadas")}
                      </th>
                    </>
                  ) : (
                    <>
                      <th 
                        className="text-center p-3 font-semibold text-gray-700 cursor-pointer hover:bg-blue-100 transition"
                        onClick={() => handleSort("points")}
                      >
                        Puntos {getSortIcon("points")}
                      </th>
                      <th 
                        className="text-center p-3 font-semibold text-gray-700 cursor-pointer hover:bg-blue-100 transition"
                        onClick={() => handleSort("avg")}
                      >
                        Media {getSortIcon("avg")}
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayData.map((participant, idx) => (
                  <tr key={participant.name} className={`${getPositionStyle(idx)} transition-colors`}>
                    <td className="p-3 font-bold text-lg">
                      {idx === 0 && <span className="text-2xl">🥇</span>}
                      {idx === 1 && <span className="text-2xl">🥈</span>}
                      {idx === 2 && <span className="text-2xl">🥉</span>}
                      {idx > 2 && <span className="text-gray-600">{idx + 1}.</span>}
                    </td>
                    <td className="p-3 font-semibold text-gray-900">{participant.name}</td>
                    {classificationMode === "general" ? (
                      <>
                        <td className="p-3 text-center">
                          <span className="font-bold text-lg text-black">{participant.totalPoints}</span>
                        </td>
                        <td className="p-3 text-center">
                          <span className="font-semibold text-black">{participant.avgOfAvgs}</span>
                        </td>
                        <td className="p-3 text-center">
                          <span className="font-semibold text-black">{participant.count}</span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-3 text-center">
                          <span className="font-bold text-lg text-black">{participant.points}</span>
                        </td>
                        <td className="p-3 text-center">
                          <span className="font-semibold text-black">{participant.avg}</span>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  function ViewEquipos() {
    const parts = currentJornadaData.participants;
    const part = currentParticipant;
    const hasParticipants = parts.length > 0;

    return (
      <div className="space-y-4 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h2 className="text-xl font-bold">⚽ Equipos - Jornada {state.currentJornada}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={state.currentJornada}
              onChange={(e) => setState((s) => ({ ...s, currentJornada: parseInt(e.target.value, 10) }))}
              className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
            >
              {Array.from({ length: 26 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Jornada {i + 1}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setAddParticipantOpen(true)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition"
            >
              + Añadir participante
            </button>
          </div>
        </div>

        {hasParticipants && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-2 flex-wrap">
              {parts.map((pt, i) => (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() => setSelectedParticipant(i)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition border ${i === selectedParticipant ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"}`}
                >
                  {pt.name}
                </button>
              ))}
            </div>
            {part && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-black">
                  {participantPoints(part)} pts (Media: {participantAvg(part)})
                </span>
                <button
                  type="button"
                  onClick={() => deleteParticipant(selectedParticipant)}
                  className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg text-sm font-semibold transition"
                  title="Eliminar participante"
                >
                  🗑️
                </button>
              </div>
            )}
          </div>
        )}

        {hasParticipants && part ? (
          <>
            <div className="bg-gray-50 rounded-xl p-4 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-lg">{part.name}</h3>
                  <p className="text-sm text-gray-600">Formación: {part.formation}</p>
                </div>
                <div className="w-full sm:w-auto">
                  <FormationPicker
                    value={part.formation}
                    onChange={(newF) => changeParticipantFormation(selectedParticipant, newF)}
                  />
                </div>
              </div>
            </div>
            <Pitch rows={rowsForParticipant} />
          </>
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-xl">
            <div className="text-gray-500 mb-4">
              <div className="text-4xl mb-2">⚽</div>
              <p className="text-lg">No hay participantes en esta jornada</p>
              <p className="text-sm">Añade un participante para comenzar</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Modal para seleccionar jugador
  const modalView = modal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => setModal(null)} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-bold">Seleccionar Jugadora</h3>
          <p className="text-sm text-gray-600">Posición: {modal.role}</p>
        </div>
        <div className="overflow-y-auto max-h-[60vh]">
          <div className="p-2">
            {players
              .filter((p) => hasRole(p, modal.role))
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((player) => {
                const points = currentPoints[player.id] || 0;
                const notPlayed = currentNotPlayed[player.id];
                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => assignToSlotForTarget(player.id)}
                    className="w-full p-3 text-left rounded-lg hover:bg-gray-50 transition border-b border-gray-100 last:border-b-0"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <BadgePosMulti roles={player.roles} />
                        <div>
                          <div className="font-semibold">{player.name}</div>
                          <div className="text-xs text-gray-500">{player.roles.join(", ")}</div>
                        </div>
                      </div>
                      <div className={`text-sm font-semibold ${notPlayed ? "text-gray-500" : pointsColorClass(points)}`}>
                        {notPlayed ? "No jugó" : `${points} pts`}
                      </div>
                    </div>
                  </button>
                );
              })}
            {currentParticipant?.lineup[modal.role][modal.index] && (
              <button
                type="button"
                onClick={clearSlotForTarget}
                className="w-full p-3 text-center rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-semibold transition mt-2"
              >
                Quitar Jugadora
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Modal para añadir jugador
  const addPlayerModal = addOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => setAddOpen(false)} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-5">
        <h3 className="text-lg font-bold mb-4">Añadir Nueva Jugadora</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold mb-1">Nombre completo</label>
            <input
              type="text"
              value={newPlayer.name}
              onChange={(e) => setNewPlayer((s) => ({ ...s, name: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="Ana García"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Posición principal</label>
            <select
              value={newPlayer.pos}
              onChange={(e) => setNewPlayer((s) => ({ ...s, pos: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black"
            >
              {POS.map((pos) => (
                <option key={pos} value={pos}>{pos}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={() => setAddOpen(false)}
            className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={addPlayer}
            className="px-3 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-900"
          >
            Añadir
          </button>
        </div>
      </div>
    </div>
  );

  // Modal para añadir participante
  const addParticipantModal = addParticipantOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => setAddParticipantOpen(false)} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl p-5">
        <h3 className="text-lg font-bold mb-4">Añadir Participante</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold mb-1">Nombre del participante</label>
            <input
              type="text"
              value={newParticipantName}
              onChange={(e) => setNewParticipantName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="Nombre del participante"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={() => setAddParticipantOpen(false)}
            className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={addParticipant}
            className="px-3 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-900"
          >
            Añadir
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 overflow-x-hidden">
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <h1 className="text-2xl font-black text-gray-900">⚽ Fantasy Amigas del Duero</h1>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            <TabButton active={tab === "equipos"} onClick={() => setTab("equipos")}>
              Equipos
            </TabButton>
            <TabButton active={tab === "totw"} onClick={() => setTab("totw")}>
              Equipo de la Semana
            </TabButton>
            <TabButton active={tab === "scores"} onClick={() => setTab("scores")}>
              Puntuaciones
            </TabButton>
            <TabButton active={tab === "clasificacion"} onClick={() => setTab("clasificacion")}>
              Clasificación
            </TabButton>
          </div>
        </div>

        {tab === "equipos" && <ViewEquipos />}
        {tab === "totw" && <ViewTOTW />}
        {tab === "scores" && <ViewScores />}
        {tab === "clasificacion" && <ViewClassification />}

        {modalView}
        {addPlayerModal}
        {addParticipantModal}
        
        <ConfirmDialog
          open={confirm.open}
          title={confirm.title}
          body={confirm.body}
          onConfirm={confirm.onYes}
          onCancel={() => setConfirm({ open: false, title: "", body: "", onYes: null })}
        />
      </div>
    </div>
  );
}

export default AppFantasy;