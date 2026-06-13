export interface AppliedSceneSignatures {
  exact: Set<string>;
  elementIds: Map<string, number>;
}

export function createAppliedSceneSignatures(): AppliedSceneSignatures {
  return {
    exact: new Set(),
    elementIds: new Map(),
  };
}

export function sceneSignature(elements: readonly unknown[]): string {
  return elements
    .map((element) => {
      const candidate = element as { id?: string; version?: number; versionNonce?: number };
      return `${candidate.id ?? ""}:${candidate.version ?? 0}:${candidate.versionNonce ?? 0}`;
    })
    .join("|");
}

export function sceneElementIdSignature(elements: readonly unknown[]): string {
  return elements
    .map((element) => {
      const candidate = element as { id?: string };
      return candidate.id ?? "";
    })
    .join("|");
}

export function rememberAppliedScene(
  signatures: AppliedSceneSignatures,
  elements: readonly unknown[],
): void {
  rememberAppliedSignature(signatures.exact, sceneSignature(elements));
  rememberElementIdSignature(signatures.elementIds, sceneElementIdSignature(elements));
}

export function consumeAppliedSceneEcho(
  signatures: AppliedSceneSignatures,
  elements: readonly unknown[],
): boolean {
  const exact = sceneSignature(elements);
  const elementIds = sceneElementIdSignature(elements);
  if (signatures.exact.has(exact)) {
    signatures.exact.delete(exact);
    decrementElementIdSignature(signatures.elementIds, elementIds);
    return true;
  }

  return decrementElementIdSignature(signatures.elementIds, elementIds);
}

function decrementElementIdSignature(signatures: Map<string, number>, signature: string): boolean {
  const remaining = signatures.get(signature) ?? 0;
  if (remaining <= 0) {
    return false;
  }

  if (remaining === 1) {
    signatures.delete(signature);
  } else {
    signatures.set(signature, remaining - 1);
  }
  return true;
}

function rememberAppliedSignature(signatures: Set<string>, signature: string): void {
  signatures.add(signature);
  if (signatures.size <= 50) {
    return;
  }

  const oldest = signatures.values().next().value;
  if (typeof oldest === "string") {
    signatures.delete(oldest);
  }
}

function rememberElementIdSignature(signatures: Map<string, number>, signature: string): void {
  signatures.set(signature, 5);
  if (signatures.size <= 50) {
    return;
  }

  const oldest = signatures.keys().next().value;
  if (typeof oldest === "string") {
    signatures.delete(oldest);
  }
}
