import React, { useEffect, useMemo, useState } from "react";
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

export default App;
