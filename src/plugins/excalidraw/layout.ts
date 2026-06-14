export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type DistributeMode = "horizontal" | "vertical";

export interface LayoutObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutUpdate {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface AlignDistributeOptions {
  align?: AlignMode;
  distribute?: DistributeMode;
  equalizeWidth?: boolean;
  equalizeHeight?: boolean;
  snapToGrid?: number;
}

export interface GridLayoutOptions {
  columns?: number;
  gapX?: number;
  gapY?: number;
  originX?: number;
  originY?: number;
}

export function planAlignDistribute(
  objects: LayoutObject[],
  options: AlignDistributeOptions,
): LayoutUpdate[] {
  if (objects.length === 0) {
    return [];
  }

  const working = objects.map((object) => ({ ...object }));
  const updates = new Map<string, LayoutUpdate>(
    working.map((object) => [object.id, { id: object.id }]),
  );

  if (options.equalizeWidth) {
    const width = Math.max(...working.map((object) => object.width));
    for (const object of working) {
      object.width = width;
      getUpdate(updates, object.id).width = width;
    }
  }

  if (options.equalizeHeight) {
    const height = Math.max(...working.map((object) => object.height));
    for (const object of working) {
      object.height = height;
      getUpdate(updates, object.id).height = height;
    }
  }

  if (options.align) {
    applyAlignment(working, updates, options.align);
  }

  if (options.distribute) {
    applyDistribution(working, updates, options.distribute);
  }

  if (options.snapToGrid) {
    for (const update of updates.values()) {
      if (update.x !== undefined) {
        update.x = snap(update.x, options.snapToGrid);
      }
      if (update.y !== undefined) {
        update.y = snap(update.y, options.snapToGrid);
      }
    }
  }

  return [...updates.values()].filter((update) => Object.keys(update).length > 1);
}

export function planGridLayout(
  objects: LayoutObject[],
  options: GridLayoutOptions = {},
): LayoutUpdate[] {
  if (objects.length === 0) {
    return [];
  }

  const columns = options.columns ?? Math.ceil(Math.sqrt(objects.length));
  const gapX = options.gapX ?? 40;
  const gapY = options.gapY ?? 40;
  const originX = options.originX ?? Math.min(...objects.map((object) => object.x));
  const originY = options.originY ?? Math.min(...objects.map((object) => object.y));
  const cellWidth = Math.max(...objects.map((object) => object.width)) + gapX;
  const cellHeight = Math.max(...objects.map((object) => object.height)) + gapY;

  return objects.map((object, index) => ({
    id: object.id,
    x: originX + (index % columns) * cellWidth,
    y: originY + Math.floor(index / columns) * cellHeight,
  }));
}

function applyAlignment(
  objects: LayoutObject[],
  updates: Map<string, LayoutUpdate>,
  align: AlignMode,
): void {
  const left = Math.min(...objects.map((object) => object.x));
  const top = Math.min(...objects.map((object) => object.y));
  const right = Math.max(...objects.map((object) => object.x + object.width));
  const bottom = Math.max(...objects.map((object) => object.y + object.height));
  const center = left + (right - left) / 2;
  const middle = top + (bottom - top) / 2;

  for (const object of objects) {
    const update = getUpdate(updates, object.id);
    if (align === "left") {
      object.x = left;
      update.x = left;
    } else if (align === "center") {
      object.x = center - object.width / 2;
      update.x = object.x;
    } else if (align === "right") {
      object.x = right - object.width;
      update.x = object.x;
    } else if (align === "top") {
      object.y = top;
      update.y = top;
    } else if (align === "middle") {
      object.y = middle - object.height / 2;
      update.y = object.y;
    } else {
      object.y = bottom - object.height;
      update.y = object.y;
    }
  }
}

function applyDistribution(
  objects: LayoutObject[],
  updates: Map<string, LayoutUpdate>,
  distribute: DistributeMode,
): void {
  if (objects.length < 3) {
    return;
  }

  if (distribute === "horizontal") {
    const sorted = [...objects].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
    const first = sorted[0];
    if (!first) {
      return;
    }

    const left = first.x;
    const right = Math.max(...sorted.map((object) => object.x + object.width));
    const totalWidth = sorted.reduce((sum, object) => sum + object.width, 0);
    const gap = (right - left - totalWidth) / (sorted.length - 1);
    let nextX = left;
    for (const object of sorted) {
      object.x = nextX;
      getUpdate(updates, object.id).x = nextX;
      nextX += object.width + gap;
    }
    return;
  }

  const sorted = [...objects].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  const first = sorted[0];
  if (!first) {
    return;
  }

  const top = first.y;
  const bottom = Math.max(...sorted.map((object) => object.y + object.height));
  const totalHeight = sorted.reduce((sum, object) => sum + object.height, 0);
  const gap = (bottom - top - totalHeight) / (sorted.length - 1);
  let nextY = top;
  for (const object of sorted) {
    object.y = nextY;
    getUpdate(updates, object.id).y = nextY;
    nextY += object.height + gap;
  }
}

function snap(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

function getUpdate(updates: Map<string, LayoutUpdate>, id: string): LayoutUpdate {
  const update = updates.get(id);
  if (!update) {
    throw new Error(`Missing layout update for object: ${id}`);
  }
  return update;
}
