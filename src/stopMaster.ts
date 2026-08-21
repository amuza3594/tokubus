import rawStopMaster from "./data/stopMaster.json";

export type Direction = "往" | "復";

export const DIRECTION_LABEL: Record<Direction, string> = {
  往: "往路",
  復: "復路",
};

interface RouteMaster {
  name: string;
  directions: Partial<Record<Direction, string[]>>;
}

const stopMaster = rawStopMaster as Record<string, RouteMaster>;

export function findRoute(routeNumber: string): RouteMaster | null {
  const key = routeNumber.trim();
  if (!key) return null;
  return stopMaster[key] ?? null;
}

export function availableDirections(routeNumber: string): Direction[] {
  const route = findRoute(routeNumber);
  if (!route) return [];
  return (Object.keys(route.directions) as Direction[]).filter(
    (d) => (route.directions[d]?.length ?? 0) > 0,
  );
}

export function getStopSequence(
  routeNumber: string,
  direction: Direction | null,
): string[] | null {
  const route = findRoute(routeNumber);
  if (!route) return null;
  const dirs = availableDirections(routeNumber);
  if (dirs.length === 0) return null;
  const useDirection = direction && dirs.includes(direction) ? direction : dirs[0];
  return route.directions[useDirection] ?? null;
}
