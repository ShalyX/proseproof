import path from 'node:path';

const UI_VERB =
  /\b(click|open|select|choose|press|tap|navigate|go to|visit|sign in|log in|enter|type|fill|submit|create|add|delete|remove|filter|search|sort|upload|export|download|toggle|check|verify|confirm|see|view|land on|reach|shows?|displays?)\b/i;

const SHELL_ONLY =
  /^(?:\$|>|npm|npx|pnpm|yarn|git|docker|curl|wget|brew|apt|pip|python|node\s|cd\s|cp\s|mv\s|mkdir|export\s)/i;

const BROWSER_SECTION =
  /(quick\s?start|try it|try the|usage|getting started|walkthrough|how to use|first run|demo|tour|what you can do|features)/i;

const SETUP_SECTION = /(prerequisite|install|setup|configure|configuration|environment)/i;

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'with', 'for', 'is', 'are',
  'you', 'your', 'it', 'this', 'that', 'then', 'should', 'will', 'can', 'be', 'as',
  'at', 'by', 'from', 'into', 'up', 'out', 'new', 'all', 'only',
]);

export function plain(value) {
  return String(value)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speakMarkdown(value) {
  return String(value ?? '')
    .replace(/\*\*([^*]+)\*\*/g, '"$1"')
    .replace(/`([^`]+)`/g, '"$1"')
    .replace(/\*([^*]+)\*/g, '"$1"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(value) {
  return plain(value)
    .toLowerCase()
    .replace(/[^a-z0-9@._/-]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !STOPWORDS.has(word));
}

export function similarity(a, b) {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

function headingOf(line) {
  const match = /^(#{1,6})\s+(.*)$/.exec(line);
  if (!match) return null;
  return { level: match[1].length, text: match[2].trim() };
}

function listMarker(line) {
  const match = /^\s{0,3}(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line);
  if (!match) return null;
  return { indent: line.match(/^\s*/)[0].length, marker: match[1] || match[2], text: match[3] };
}

function firstBold(text) {
  const match = /\*\*([^*]+)\*\*/.exec(text);
  return match ? plain(match[1]) : null;
}

function titleFrom(action, expectation) {
  if (/sign in|log in/i.test(action || expectation || '')) return 'Sign in';
  let candidate = plain(action || expectation || 'Documented promise').split(',')[0].trim();
  if (candidate.length > 48) {
    candidate = candidate.split(/\s+/).slice(0, 7).join(' ').replace(/[,:;.]$/, '');
  }
  if (!candidate) return 'Documented promise';
  return candidate[0].toUpperCase() + candidate.slice(1);
}

function splitActionExpectation(text) {
  const cleaned = text.trim().replace(/\.$/, '');
  const dash = /\s+[—–]\s+/.exec(cleaned) || /\s+-\s+/.exec(cleaned);
  if (dash) {
    return {
      action: cleaned.slice(0, dash.index).trim(),
      expectation: cleaned.slice(dash.index + dash[0].length).trim(),
    };
  }
  const then = /\s*(?:,\s*)?(?:and\s+)?then\s+(?:confirm|verify|check that|you should see)\s+/i.exec(cleaned);
  if (then) {
    return {
      action: cleaned.slice(0, then.index).trim(),
      expectation: cleaned.slice(then.index + then[0].length).trim(),
    };
  }
  const confirm = /\s+(?:and\s+)?(?:confirm|verify|check that)\s+/i.exec(cleaned);
  if (confirm) {
    return {
      action: cleaned.slice(0, confirm.index).trim(),
      expectation: cleaned.slice(confirm.index + confirm[0].length).trim(),
    };
  }
  const purpose = /\s+to\s+(download|open|create|see|view|reach|land on|show|display|export)\s+/i.exec(cleaned);
  if (purpose) {
    return {
      action: cleaned.slice(0, purpose.index).trim(),
      expectation: `${purpose[1]} ${cleaned.slice(purpose.index + purpose[0].length)}`.trim(),
    };
  }
  if (/^(the|this|you should|you will|after|once)\b/i.test(cleaned)) {
    return { action: '', expectation: cleaned };
  }
  return { action: cleaned, expectation: '' };
}

function normalizeExpectation(value) {
  return value
    .replace(/^you should (?:land on|be taken to|arrive at|see)\s+/i, 'you are on ')
    .replace(/^you (?:land|arrive) on\s+/i, 'you are on ')
    .replace(/^you should see\s+/i, 'the page shows ')
    .replace(/^you see\s+/i, 'the page shows ')
    .trim();
}

export function extractCredentials(text) {
  const patterns = [
    /`([^`\s]+@[^`\s]+)`\s*(?:\/|,|and)\s*`([^`\s]+)`/i,
    /(?:sign in|log in)[^.\n]{0,60}?with\s+`?([\w.+-]+@[\w.-]+)`?\s*(?:\/|,|and)\s*`?([^\s`]+)`?/i,
    /(?:email|username)\s*[:=]\s*`?([\w.+-]+@[\w.-]+)`?[^\n]{0,40}?(?:password)\s*[:=]\s*`?([^\s`]+)`?/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return { email: match[1], password: match[2] };
  }
  return null;
}

export function extractBaseUrl(text) {
  const matches = [...text.matchAll(/https?:\/\/[^\s`)\]"']+/g)].map((m) => m[0].replace(/[.,;:]$/, ''));
  if (!matches.length) return null;
  const local = matches.find((url) => /localhost|127\.0\.0\.1/.test(url));
  return local || matches[0];
}

export function extractClaims({ docs, baseUrl = null }) {
  const claims = [];
  const warnings = [];
  let setupText = '';

  for (const doc of docs) {
    const lines = doc.content.split(/\r?\n/);
    const docName = path.basename(doc.path);
    setupText += '\n' + doc.content;

    let section = { text: '', level: 0 };
    let item = null;

    const flush = () => {
      if (!item) return;
      const candidate = item.text.trim();
      const sectionName = item.section;
      item = null;
      if (!candidate) return;
      if (SHELL_ONLY.test(candidate)) return;
      if (/^https?:\/\//.test(candidate)) return;
      if (!BROWSER_SECTION.test(sectionName) && !BROWSER_SECTION.test(itemHeading ?? '')) {
        // still allow explicit browser verbs outside a tutorial section, but require a quoted label
        if (!/(\*\*[^*]+\*\*|`[^`]+`)/.test(candidate)) return;
      }
      if (!UI_VERB.test(candidate)) return;
      const quoted = /(\*\*[^*]+\*\*|`[^`]+`)/.test(candidate);
      const { action, expectation } = splitActionExpectation(candidate);
      if (!action && !expectation) return;
      if (!expectation) {
        warnings.push(`${docName}:${itemLine} — skipped, no verifiable expectation ("${plain(candidate).slice(0, 80)}")`);
        return;
      }
      if (!quoted && !UI_VERB.test(action)) return;
      const claim = {
        id: `N-${String(claims.length + 1).padStart(2, '0')}`,
        title: titleFrom(action, expectation),
        quote: candidate,
        text: plain(candidate),
        action: plain(action),
        expectation: plain(normalizeExpectation(expectation)),
        rawAction: action,
        rawExpectation: normalizeExpectation(expectation),
        citation: { file: docName, path: doc.path, line: itemLine },
        location: `${docName}:${itemLine}`,
        section: sectionName,
        hasQuotedLabel: quoted,
      };
      if (claims.some((existing) => similarity(existing.text, claim.text) > 0.92)) return;
      claims.push(claim);
    };

    let itemHeading = '';
    let itemLine = 0;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lineNo = index + 1;
      const heading = headingOf(line);
      if (heading) {
        flush();
        section = { text: heading.text, level: heading.level };
        continue;
      }
      const marker = listMarker(line);
      if (marker) {
        flush();
        item = { text: marker.text, section: section.text };
        itemHeading = section.text;
        itemLine = lineNo;
        continue;
      }
      if (item && /^\s{2,}\S/.test(line)) {
        item.text += ' ' + line.trim();
        continue;
      }
      if (item && line.trim() === '') {
        // look ahead: a new list item ends the current one, plain prose also ends it
        const next = lines[index + 1] || '';
        if (!listMarker(next) && !/^\s{2,}\S/.test(next)) flush();
        continue;
      }
      if (item && line.trim() && !listMarker(line)) {
        flush();
      }
    }
    flush();
  }

  const credentials = extractCredentials(setupText);
  const detectedUrl = baseUrl || extractBaseUrl(setupText);
  const unverifiable = SETUP_SECTION.test(setupText) ? [] : [];

  return { claims, warnings, setup: { credentials, baseUrl: detectedUrl }, unverifiable };
}

export function claimFromMarkdown(docPath, content) {
  return extractClaims({ docs: [{ path: docPath, content }] });
}
