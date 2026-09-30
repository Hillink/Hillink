// Pass 4.5: everything the broker returns to Claude passes through here. Claude sees logical repository paths and
// repository text only: no host or sandbox infrastructure paths, no usernames, no environment, no credentials.
// Repository text is returned as it is (it is the task's own data), except that anything shaped like a credential is
// redacted, so a planted key can never be echoed into a prompt or a patch.
import { SECRET_PATTERNS } from '../sandbox.mjs';

const HOST_PATHS = [
  /\/work\//g, // the sandbox's staged tree
  /\b[A-Za-z]:\\(?:[^\\\s"'<>|]+\\)*[^\\\s"'<>|]*/g, // Windows absolute paths
  /\\\\[^\\\s]+\\[^\s"'<>|]*/g, // UNC paths
  /\/(?:home|root|Users|mnt|var\/hq|opt\/hq|run\/hq|tmp\/hq-[^/\s]*)\/[^\s"'<>|:]*/g, // host and sandbox internals
];

export function sanitizeText(text, { maxBytes = 200_000 } = {}) {
  let s = String(text ?? '');
  s = s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '�');
  for (const re of SECRET_PATTERNS) s = s.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`), '[REDACTED CREDENTIAL]');
  s = s.replace(HOST_PATHS[0], '');
  for (const re of HOST_PATHS.slice(1)) s = s.replace(re, '<host path hidden>');
  if (Buffer.byteLength(s) > maxBytes) s = `${Buffer.from(s).subarray(0, maxBytes).toString('utf8').replace(/�$/, '')}\n[... truncated by HQ at ${maxBytes} bytes]`;
  return s;
}

// A refusal message back to Claude: short, no stack, sanitized.
export const refusalText = error => sanitizeText(`HQ broker refused this call: ${String(error?.message ?? error).split('\n')[0]}`, { maxBytes: 600 });
