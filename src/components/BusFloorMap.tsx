import { useRef, useState } from "react";
import type { PassengerRecord } from "../types";

const VB_W = 200;
const VB_H = 320;
const DRAG_THRESHOLD = 5;

interface Props {
  passengers: PassengerRecord[];
  onMove: (id: string, mapX: number, mapY: number) => void;
  onTap: (passenger: PassengerRecord) => void;
}

interface DragState {
  id: string;
  startClientX: number;
  startClientY: number;
  moved: boolean;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export default function BusFloorMap({ passengers, onMove, onTap }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragState = useRef<DragState | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );

  function clientToPoint(clientX: number, clientY: number) {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const transformed = pt.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  function handlePointerDown(e: React.PointerEvent<SVGGElement>, p: PassengerRecord) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      id: p.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    };
  }

  function handlePointerMove(e: React.PointerEvent<SVGGElement>) {
    const state = dragState.current;
    if (!state) return;
    const dx = e.clientX - state.startClientX;
    const dy = e.clientY - state.startClientY;
    if (!state.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      state.moved = true;
    }
    if (!state.moved) return;
    const { x, y } = clientToPoint(e.clientX, e.clientY);
    setDragPos({ id: state.id, x: clamp01(x / VB_W), y: clamp01(y / VB_H) });
  }

  function handlePointerUp(p: PassengerRecord) {
    const state = dragState.current;
    dragState.current = null;
    if (state && state.moved) {
      setDragPos((current) => {
        if (current && current.id === p.id) {
          onMove(p.id, current.x, current.y);
        }
        return null;
      });
    } else if (state) {
      onTap(p);
    }
  }

  const zoneY1 = 8 + (VB_H - 16) / 3;
  const zoneY2 = 8 + ((VB_H - 16) * 2) / 3;

  return (
    <div className="bus-map-wrapper">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="bus-map-svg"
      >
        {/* 背景の図形をすべて先に描画し、ラベルはその後に重ねて必ず見えるようにする */}
        <rect
          x="8"
          y="8"
          width={VB_W - 16}
          height={VB_H - 16}
          rx="24"
          className="bus-map-outline"
        />
        <line x1="8" y1={zoneY1} x2={VB_W - 8} y2={zoneY1} className="bus-map-divider" />
        <line x1="8" y1={zoneY2} x2={VB_W - 8} y2={zoneY2} className="bus-map-divider" />
        <rect x="16" y="14" width="36" height="26" rx="4" className="bus-map-driver" />
        <rect
          x={VB_W - 36}
          y="14"
          width="24"
          height="40"
          rx="4"
          className="bus-map-door"
        />
        <rect
          x={VB_W - 36}
          y={VB_H / 2 - 20}
          width="24"
          height="40"
          rx="4"
          className="bus-map-door"
        />
        <rect x="12" y="52" width="16" height={VB_H - 104} rx="6" className="bus-map-seats" />
        <rect
          x={VB_W - 28}
          y={VB_H / 2 + 32}
          width="16"
          height={VB_H / 2 - 62}
          rx="6"
          className="bus-map-seats"
        />

        <text x="36" y="50" className="bus-map-zone-label">
          前方
        </text>
        <text x="36" y={zoneY1 + 22} className="bus-map-zone-label">
          中央
        </text>
        <text x="36" y={zoneY2 + 22} className="bus-map-zone-label">
          後方
        </text>
        <text x="34" y="31" textAnchor="middle" className="bus-map-tiny-label">
          運転席
        </text>
        <text x={VB_W - 24} y="38" textAnchor="middle" className="bus-map-tiny-label">
          乗車口
        </text>
        <text
          x={VB_W - 24}
          y={VB_H / 2 + 4}
          textAnchor="middle"
          className="bus-map-tiny-label"
        >
          降車口
        </text>
        <text
          x={VB_W / 2}
          y={VB_H / 2 + 6}
          textAnchor="middle"
          className="bus-map-aisle-label"
        >
          立席（通路）
        </text>

        {passengers.map((p) => {
          const x = (dragPos && dragPos.id === p.id ? dragPos.x : p.mapX) * VB_W;
          const y = (dragPos && dragPos.id === p.id ? dragPos.y : p.mapY) * VB_H;
          return (
            <g
              key={p.id}
              transform={`translate(${x}, ${y})`}
              className="bus-map-token"
              onPointerDown={(e) => handlePointerDown(e, p)}
              onPointerMove={handlePointerMove}
              onPointerUp={() => handlePointerUp(p)}
              onPointerCancel={() => {
                dragState.current = null;
                setDragPos(null);
              }}
            >
              <circle r="12" className={"bus-map-circle " + p.gender} />
              <text textAnchor="middle" dy="4" className="bus-map-number">
                {p.passengerNumber}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="bus-map-hint">
        ドラッグで位置を調整・タップで降車記録
      </div>
    </div>
  );
}
