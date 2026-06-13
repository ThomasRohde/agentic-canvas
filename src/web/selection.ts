export function selectedIdsFromAppState(appState: unknown): string[] {
  if (typeof appState !== "object" || appState === null) {
    return [];
  }

  const selectedElementIds = (appState as { selectedElementIds?: unknown }).selectedElementIds;
  if (selectedElementIds instanceof Map) {
    return [...selectedElementIds.entries()]
      .filter(
        (entry): entry is [string, unknown] => typeof entry[0] === "string" && Boolean(entry[1]),
      )
      .map(([id]) => id);
  }

  if (Array.isArray(selectedElementIds)) {
    return selectedElementIds.filter((id): id is string => typeof id === "string");
  }

  if (typeof selectedElementIds !== "object" || selectedElementIds === null) {
    return [];
  }

  return Object.entries(selectedElementIds)
    .filter(([, selected]) => selected === true)
    .map(([id]) => id);
}
