export type LogLevel = "debug" | "info" | "warn" | "error";

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(message: string, details?: unknown): void;
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

export function createLogger(minLevel: LogLevel = "info"): Logger {
  const min = levelOrder[minLevel];

  const write = (level: LogLevel, message: string, details?: unknown) => {
    if (levelOrder[level] < min) {
      return;
    }

    const suffix = details === undefined ? "" : ` ${formatDetails(details)}`;
    console.error(`[agentic-canvas] ${level}: ${message}${suffix}`);
  };

  return {
    debug: (message, details) => write("debug", message, details),
    info: (message, details) => write("info", message, details),
    warn: (message, details) => write("warn", message, details),
    error: (message, details) => write("error", message, details),
  };
}

function formatDetails(details: unknown): string {
  if (details instanceof Error) {
    return details.stack ?? details.message;
  }

  if (typeof details === "string") {
    return details;
  }

  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}
