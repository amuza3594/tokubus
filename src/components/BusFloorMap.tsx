import { useEffect, useRef, useState } from "react";
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
  pointerId: number;
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
  const passengersRef = useRef(passengers);
  passengersRef.current = passengers;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

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

  // ポインターの移動・終了はwindow全体で監視する（SVG要素上でのsetPointerCapture
  // に頼ると一部の環境で捕捉に失敗し、ドラッグが全く反応しなくなるため）
  useEffect(() => {
    function handleMove(e: PointerEvent) {
      const state = dragState.current;
      if (!state || e.pointerId !== state.pointerId) return;
      const dx = e.clientX - state.startClientX;
      const dy = e.clientY - state.startClientY;
      if (!state.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        state.moved = true;
      }
      if (!state.moved) return;
      e.preventDefault();
      const { x, y } = clientToPoint(e.clientX, e.clientY);
      setDragPos({ id: state.id, x: clamp01(x / VB_W), y: clamp01(y / VB_H) });
    }

    function handleUp(e: PointerEvent) {
      const state = dragState.current;
      if (!state || e.pointerId !== state.pointerId) return;
      dragState.current = null;
      if (state.moved) {
        setDragPos((current) => {
          if (current && current.id === state.id) {
            onMoveRef.current(state.id, current.x, current.y);
          }
          return null;
        });
      } else {
        const passenger = passengersRef.current.find((p) => p.id === state.id);
        if (passenger) onTapRef.current(passenger);
      }
    }

    function handleCancel(e: PointerEvent) {
      const state = dragState.current;
      if (!state || e.pointerId !== state.pointerId) return;
      dragState.current = null;
      setDragPos(null);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleCancel);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };
  }, []);

  function handlePointerDown(e: React.PointerEvent<SVGGElement>, p: PassengerRecord) {
    e.preventDefault();
    dragState.current = {
      id: p.id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    };
  }

  const zoneY1 = 8 + (VB_H - 16) / 3;
  const zoneY2 = 8 + ((VB_H - 16) * 2) / 3;

  // 実際のバス車内は左側通行（乗降口が左側）・運転席が右側にあるため、
  // その向きに合わせてレイアウト。前方の乗降口（運転席側）は降車口、
  // 中ほどの乗降口は乗車口（後乗り前降り）とする。
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
        <rect x={VB_W - 52} y="14" width="36" height="26" rx="4" className="bus-map-driver" />
        <rect x="12" y="14" width="24" height="40" rx="4" className="bus-map-door" />
        <rect
          x="12"
          y={VB_H / 2 - 20}
          width="24"
          height="40"
          rx="4"
          className="bus-map-door"
        />
        <rect
          x={VB_W - 28}
          y="52"
          width="16"
          height={VB_H - 104}
          rx="6"
          className="bus-map-seats"
        />
        <rect x="12" y={VB_H / 2 + 32} width="16" height={VB_H / 2 - 62} rx="6" className="bus-map-seats" />

        <text x="36" y="50" className="bus-map-zone-label">
          前方
        </text>
        <text x="36" y={zoneY1 + 22} className="bus-map-zone-label">
          中央
        </text>
        <text x="36" y={zoneY2 + 22} className="bus-map-zone-label">
          後方
        </text>
        <text x={VB_W - 34} y="31" textAnchor="middle" className="bus-map-tiny-label">
          運転席
        </text>
        <text x="24" y="38" textAnchor="middle" className="bus-map-tiny-label">
          降車口
        </text>
        <text
          x="24"
          y={VB_H / 2 + 4}
          textAnchor="middle"
          className="bus-map-tiny-label"
        >
          乗車口
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
