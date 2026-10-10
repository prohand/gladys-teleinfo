// -----------------------------------------------------------------------------
// Decoder of the Enedis TIC (télé-information client) serial stream.
//
// Spec: Enedis-NOI-CPT_54E (Linky) and Enedis-NOI-CPT_02E (historic meters).
// A frame is STX <groups> ETX, a group is LF <label> SEP <data> SEP <checksum>
// CR. Two modes exist:
//   - historic (1200 bauds, also sent by older electronic meters): SEP is a
//     space, the checksum covers the label and the data (some meters include
//     the separator before the checksum: both variants are accepted);
//   - standard (9600 bauds, Linky only): SEP is a tab, a group may carry a
//     timestamp between the label and the data, and the checksum covers
//     everything up to the last tab included.
// The line is 7 data bits + even parity: when the bridge forwards 8-bit bytes
// the parity bit lands in bit 7, so every byte is masked with 0x7F.
// -----------------------------------------------------------------------------

export const MODES = {
  HISTORIC: 'historic',
  STANDARD: 'standard',
};

const STX = 0x02;
const ETX = 0x03;
const EOT = 0x04; // the meter interrupted the frame
const LF = 0x0a;
const CR = 0x0d;
const HT = '\t';
const SP = ' ';

// A frame is a few hundred bytes (about 1 KB for a three-phase Linky in
// standard mode): past this size, the stream is garbage (wrong speed).
const MAX_FRAME_BYTES = 4096;

/**
 * TIC checksum of a string: sum of the codes, 6 low bits, + 0x20.
 * @param {string} text
 */
export function checksum(text) {
  let sum = 0;
  for (let i = 0; i < text.length; i += 1) {
    sum += text.charCodeAt(i);
  }
  return String.fromCharCode((sum & 0x3f) + 0x20);
}

/**
 * Parse one group (the bytes between LF and CR, both excluded).
 * @param {string} raw
 * @returns {{ label: string, value: string, timestamp?: string, mode: string } | null}
 *   null when the group is malformed or its checksum is wrong.
 */
export function parseGroup(raw) {
  if (raw.length < 4) {
    return null;
  }
  const expected = raw[raw.length - 1];

  if (raw.includes(HT)) {
    const body = raw.slice(0, -1);
    if (!body.endsWith(HT) || checksum(body) !== expected) {
      return null;
    }
    const parts = body.slice(0, -1).split(HT);
    if (parts.length === 2) {
      return { label: parts[0], value: parts[1], mode: MODES.STANDARD };
    }
    if (parts.length === 3) {
      return { label: parts[0], timestamp: parts[1], value: parts[2], mode: MODES.STANDARD };
    }
    return null;
  }

  if (raw[raw.length - 2] !== SP) {
    return null;
  }
  const body = raw.slice(0, -2);
  if (checksum(body) !== expected && checksum(body + SP) !== expected) {
    return null;
  }
  const separator = body.indexOf(SP);
  if (separator <= 0) {
    return null;
  }
  return {
    label: body.slice(0, separator),
    value: body.slice(separator + 1),
    mode: MODES.HISTORIC,
  };
}

/**
 * Parse a full frame (the bytes between STX and ETX, both excluded).
 * @param {string} raw
 * @returns {{ mode: string, groups: Map<string, { value: string, timestamp?: string }>,
 *   invalid: number }}
 */
export function parseFrame(raw) {
  const groups = new Map();
  let invalid = 0;
  let standard = 0;
  for (const chunk of raw.split(String.fromCharCode(LF))) {
    const end = chunk.indexOf(String.fromCharCode(CR));
    if (end === -1) {
      if (chunk.length > 0) {
        invalid += 1;
      }
      continue;
    }
    const group = parseGroup(chunk.slice(0, end));
    if (!group) {
      invalid += 1;
      continue;
    }
    if (group.mode === MODES.STANDARD) {
      standard += 1;
    }
    groups.set(group.label, { value: group.value, timestamp: group.timestamp });
  }
  return {
    mode: standard > 0 ? MODES.STANDARD : MODES.HISTORIC,
    groups,
    invalid,
  };
}

/**
 * Stream decoder: feed it the raw bytes as they come, it calls `onFrame` with
 * every complete frame holding at least one valid group.
 */
export class TicDecoder {
  /**
   * @param {(frame: ReturnType<typeof parseFrame>) => void} onFrame
   */
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.current = null; // null while waiting for STX
  }

  /**
   * @param {Buffer | Uint8Array} chunk
   */
  push(chunk) {
    for (const rawByte of chunk) {
      const byte = rawByte & 0x7f;
      if (byte === STX) {
        this.current = [];
      } else if (this.current === null) {
        // Middle of a frame we did not see start: wait for the next STX.
      } else if (byte === ETX) {
        const frame = parseFrame(String.fromCharCode(...this.current));
        this.current = null;
        if (frame.groups.size > 0) {
          this.onFrame(frame);
        }
      } else if (byte === EOT) {
        this.current = null;
      } else {
        this.current.push(byte);
        if (this.current.length > MAX_FRAME_BYTES) {
          this.current = null;
        }
      }
    }
  }

  reset() {
    this.current = null;
  }
}
