import { useRef, useState } from "react";

interface Props {
  stops: string[];
  index: number;
  onIndexChange: (index: number) => void;
}

const SWIPE_THRESHOLD = 40;

export default function StopCarousel({ stops, index, onIndexChange }: Props) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef<number | null>(null);

  const clampedIndex = Math.min(Math.max(index, 0), stops.length - 1);

  function goTo(newIndex: number) {
    onIndexChange(Math.min(Math.max(newIndex, 0), stops.length - 1));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    startX.current = e.clientX;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (startX.current === null) return;
    setDragX(e.clientX - startX.current);
  }

  function endDrag() {
    if (startX.current === null) return;
    if (dragX <= -SWIPE_THRESHOLD) goTo(clampedIndex + 1);
    else if (dragX >= SWIPE_THRESHOLD) goTo(clampedIndex - 1);
    setDragX(0);
    setDragging(false);
    startX.current = null;
  }

  return (
    <div className="stop-carousel">
      <button
        type="button"
        className="stop-carousel-arrow"
        disabled={clampedIndex === 0}
        onClick={() => goTo(clampedIndex - 1)}
        aria-label="前のバス停"
      >
        ←
      </button>

      <div
        className="stop-carousel-view"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="stop-carousel-name"
          style={{
            transform: `translateX(${dragX}px)`,
            transition: dragging ? "none" : "transform 0.15s ease-out",
          }}
        >
          {stops[clampedIndex]}
        </div>
        <div className="stop-carousel-position">
          {clampedIndex + 1} / {stops.length}
        </div>
      </div>

      <button
        type="button"
        className="stop-carousel-arrow"
        disabled={clampedIndex === stops.length - 1}
        onClick={() => goTo(clampedIndex + 1)}
        aria-label="次のバス停"
      >
        →
      </button>
    </div>
  );
}
