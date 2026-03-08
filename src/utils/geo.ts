export interface Point {
    lat: number;
    lng: number;
}

export interface Zone {
    id: string;
    zoneType: string;
    coordinates: number[][]; // Array of [lat, lng]
}

/**
 * Ray-casting algorithm to determine if a point is inside a polygon.
 */
export function isPointInPolygon(point: Point, polygon: number[][]): boolean {
    const x = point.lat; // or lng, doesn't matter as long as consistent
    const y = point.lng;

    let isInside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];

        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
    }

    return isInside;
}

/**
 * Check if the participant is inside the campus boundary.
 * If campus boundaries are defined as zones with zoneType="campus" (or similar),
 * we check if it's in at least one such zone. If no campus zones exist, we assume true.
 */
export function isInsideCampus(point: Point, campusZones: Zone[]): boolean {
    if (campusZones.length === 0) return true; // Fallback if no boundary defined

    for (const zone of campusZones) {
        if (isPointInPolygon(point, zone.coordinates)) {
            return true;
        }
    }
    return false;
}

/**
 * Check if the participant is inside any restricted area.
 * Returns the restricted zone if they are inside, else null.
 */
export function getRestrictedZonePresent(point: Point, restrictedZones: Zone[]): Zone | null {
    for (const zone of restrictedZones) {
        if (isPointInPolygon(point, zone.coordinates)) {
            return zone;
        }
    }
    return null;
}
