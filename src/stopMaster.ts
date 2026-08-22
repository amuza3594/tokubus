import { getActiveStopMaster, type RouteMaster } from "./gtfsOverride";

export type Direction = "往" | "復";

export const DIRECTION_LABEL: Record<Direction, string> = {
  往: "往路",
  復: "復路",
};

export function findRoute(routeNumber: string): RouteMaster | null {
  const key = routeNumber.trim();
  if (!key) return null;
  return getActiveStopMaster()[key] ?? null;
}

export function availableDirections(routeNumber: string): Direction[] {
  const route = findRoute(routeNumber);
  if (!route) return [];
  return (Object.keys(route.directions) as Direction[]).filter(
    (d) => (route.directions[d]?.stops.length ?? 0) > 0,
  );
}

function resolveDirection(
  routeNumber: string,
  direction: Direction | null,
) {
  const route = findRoute(routeNumber);
  if (!route) return null;
  const dirs = availableDirections(routeNumber);
  if (dirs.length === 0) return null;
  const useDirection = direction && dirs.includes(direction) ? direction : dirs[0];
  return route.directions[useDirection] ?? null;
}

export function getStopSequence(
  routeNumber: string,
  direction: Direction | null,
): string[] | null {
  return resolveDirection(routeNumber, direction)?.stops ?? null;
}

// GTFSの系統キロ（GTFSのshapes.txtから概算した走行距離）。マスタに無い場合はnull。
export function getRouteDistanceKm(
  routeNumber: string,
  direction: Direction | null,
): number | null {
  return resolveDirection(routeNumber, direction)?.distanceKm ?? null;
}

// 方向選択ボタンに添える行き先ヒント（GTFSのdirection_idは往復どちらが0/1かに
// 意味を持たないため、「往路」「復路」というラベルだけでは実際にどちらの
// 方向か迷うことがある。実際の終着停留所名を添えて判断しやすくする）。
export function getRouteDestination(
  routeNumber: string,
  direction: Direction | null,
): string | null {
  return resolveDirection(routeNumber, direction)?.destination ?? null;
}
