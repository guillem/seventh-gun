// 2D editor chrome + canvas. Never requests pointer lock.
import { ENEMY_TYPES, ROOM_KINDS, THEMES } from '../sim/blueprint';
import type { MapBlueprint } from '../sim/blueprint';
import { AMMO_TYPES } from '../sim/weapons';
import { GRID_H, GRID_W, type AmmoType, type EnemyType, type Room, type Theme } from '../sim/types';
import { decodeShareCodeSync, encodeShareCodeSync, shareUrlFromCode } from '../app/mapShare';
import { MAP_CODE_PREFIX } from '../sim/mapcodec';
import {
  EditorDoc,
  previewCosmeticDots,
  type CosmeticDot,
} from './model';
import {
  filenameFromTitle,
  loadLibrary,
  upsertLibrary,
  type LibraryEntry,
} from './library';

export type EditorTool =
  | 'room' | 'corridor' | 'erase' | 'door' | 'seal'
  | 'enemy' | 'medikit' | 'ammo' | 'gun' | 'key' | 'start';

const TOOLS: { id: EditorTool; label: string }[] = [
  { id: 'room', label: 'ROOM' },
  { id: 'corridor', label: 'CORRIDOR' },
  { id: 'erase', label: 'ERASE' },
  { id: 'door', label: 'DOOR' },
  { id: 'seal', label: 'SEAL' },
  { id: 'enemy', label: 'ENEMY' },
  { id: 'medikit', label: 'MEDIKIT' },
  { id: 'ammo', label: 'AMMO' },
  { id: 'gun', label: 'GUN' },
  { id: 'key', label: 'KEY' },
  { id: 'start', label: 'START' },
];

const THEME_FILL: Record<Theme, string> = {
  industrial: '#7a5a38',
  organic: '#6a3030',
  stone: '#5a6058',
  tech: '#2a5870',
};

export interface EditorHost {
  playtest: (bp: MapBlueprint, allGuns: boolean) => void;
  toTitle: () => void;
  toast: (msg: string) => void;
  copyText: (text: string) => Promise<boolean>;
}

export class EditorView {
  root: HTMLDivElement;
  canvas: HTMLCanvasElement;
  doc = new EditorDoc();
  tool: EditorTool = 'room';
  roomKind: Room['kind'] = 'spine';
  theme: Theme = 'industrial';
  outdoor = false;
  enemyType: EnemyType = 'husk';
  ammoType: AmmoType = 'bullets';
  gunId = 2;
  doorLocked = false;
  allGuns = false;
  private host: EditorHost | null = null;
  private drag: { x0: number; z0: number; x1: number; z1: number } | null = null;
  private corrFirst: { x: number; z: number } | null = null;
  private status!: HTMLDivElement;
  private titleInput!: HTMLInputElement;
  private seedInput!: HTMLInputElement;
  private libPanel!: HTMLDivElement;
  private libList!: HTMLDivElement;
  private importPanel!: HTMLDivElement;
  private importArea!: HTMLTextAreaElement;
  private dots: CosmeticDot[] = [];
  private dotsKey = '';

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'editor-screen';
    this.root.className = 'hidden';
    this.root.innerHTML = this.markup();
    document.body.appendChild(this.root);
    this.canvas = this.root.querySelector('#editor-canvas')!;
    this.status = this.root.querySelector('#editor-status')!;
    this.titleInput = this.root.querySelector('#editor-title')!;
    this.seedInput = this.root.querySelector('#editor-seed')!;
    this.libPanel = this.root.querySelector('#editor-library')!;
    this.libList = this.root.querySelector('#editor-lib-list')!;
    this.importPanel = this.root.querySelector('#editor-import')!;
    this.importArea = this.root.querySelector('#editor-import-code')!;
    this.wireDom();
    this.wireCanvas();
    this.syncForm();
    this.setTool('room');
    window.addEventListener('resize', () => this.paint());
    this.root.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') return;
      e.stopPropagation();
    });
  }

  private markup(): string {
    const kinds = ROOM_KINDS.map(k => `<option value="${k}">${k}</option>`).join('');
    const themes = THEMES.map(t => `<option value="${t}">${t}</option>`).join('');
    const enemies = ENEMY_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
    const ammos = AMMO_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
    const guns = [2, 3, 4, 5, 6, 7].map(n => `<option value="${n}">gun ${n}</option>`).join('');
    const tools = TOOLS.map(t => `<button type="button" class="ed-tool" data-tool="${t.id}">${t.label}</button>`).join('');
    return `
      <div id="editor-chrome">
        <div class="ed-bar">
          <h2 id="editor-heading">EDITOR</h2>
          <label class="ed-field">TITLE <input id="editor-title" maxlength="40" autocomplete="off" spellcheck="false"/></label>
          <label class="ed-field">SEED <input id="editor-seed" maxlength="12" autocomplete="off"/>
            <button type="button" id="editor-seed-rnd" class="small">RND</button>
          </label>
          <label class="ed-check"><input type="checkbox" id="editor-allguns"/> start with all guns</label>
          <button type="button" id="editor-validate">VALIDATE</button>
          <button type="button" id="editor-playtest" class="big">PLAYTEST</button>
          <button type="button" id="editor-to-title">TITLE</button>
        </div>
        <div class="ed-bar ed-tools">${tools}</div>
        <div class="ed-bar ed-props">
          <label>KIND <select id="editor-kind">${kinds}</select></label>
          <label>THEME <select id="editor-theme">${themes}</select></label>
          <label class="ed-check"><input type="checkbox" id="editor-outdoor"/> outdoor</label>
          <label>ENEMY <select id="editor-enemy">${enemies}</select></label>
          <label>AMMO <select id="editor-ammo">${ammos}</select></label>
          <label>GUN <select id="editor-gun">${guns}</select></label>
          <label class="ed-check"><input type="checkbox" id="editor-locked"/> locked door</label>
          <label>UNSEAL <select id="editor-sealbreak">
            <option value="gun:2">gun 2</option>
            <option value="gun:3">gun 3</option>
            <option value="gun:4">gun 4</option>
            <option value="gun:5">gun 5</option>
            <option value="gun:6">gun 6</option>
            <option value="gun:7">gun 7</option>
            <option value="key">key</option>
          </select></label>
        </div>
        <div class="ed-bar">
          <button type="button" id="editor-new">NEW</button>
          <button type="button" id="editor-save">SAVE</button>
          <button type="button" id="editor-lib-btn">LIBRARY</button>
          <button type="button" id="editor-copy-link">COPY LINK</button>
          <button type="button" id="editor-copy-code">COPY CODE</button>
          <button type="button" id="editor-download">DOWNLOAD</button>
          <button type="button" id="editor-import-btn">IMPORT</button>
        </div>
        <div id="editor-status">stamp rooms, then link them with CORRIDOR</div>
      </div>
      <div id="editor-canvas-wrap">
        <canvas id="editor-canvas"></canvas>
      </div>
      <div id="editor-library" class="hidden">
        <div class="panel">
          <h2>LIBRARY</h2>
          <div id="editor-lib-list"></div>
          <button type="button" id="editor-lib-back" class="big">BACK</button>
        </div>
      </div>
      <div id="editor-import" class="hidden">
        <div class="panel">
          <h2>IMPORT</h2>
          <textarea id="editor-import-code" rows="6" placeholder="SGMAP.v1.… or drop a .sgmap"></textarea>
          <div class="row">
            <button type="button" id="editor-import-go">LOAD</button>
            <button type="button" id="editor-import-back">BACK</button>
          </div>
        </div>
      </div>
    `;
  }

  bind(host: EditorHost): void {
    this.host = host;
  }

  show(): void {
    this.root.classList.remove('hidden');
    this.syncForm();
    this.paint();
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.libPanel.classList.add('hidden');
    this.importPanel.classList.add('hidden');
  }

  isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  loadBlueprint(bp: MapBlueprint, libraryId: string | null = null): void {
    this.doc.load(bp, libraryId);
    this.dotsKey = '';
    this.syncForm();
    this.paint();
    this.setStatus('loaded');
  }

  getBlueprint(): MapBlueprint {
    return this.doc.snapshot();
  }

  playtest(): void {
    this.tryPlaytest();
  }

  private wireDom(): void {
    this.root.querySelector('#editor-playtest')!.addEventListener('click', () => this.tryPlaytest());
    this.root.querySelector('#editor-validate')!.addEventListener('click', () => this.runValidate(true));
    this.root.querySelector('#editor-to-title')!.addEventListener('click', () => this.host?.toTitle());
    this.root.querySelector('#editor-new')!.addEventListener('click', () => {
      this.doc.reset();
      this.dotsKey = '';
      this.syncForm();
      this.paint();
      this.setStatus('new map');
    });
    this.root.querySelector('#editor-save')!.addEventListener('click', () => this.saveCurrent());
    this.root.querySelector('#editor-lib-btn')!.addEventListener('click', () => this.openLibrary());
    this.root.querySelector('#editor-lib-back')!.addEventListener('click', () => this.libPanel.classList.add('hidden'));
    this.root.querySelector('#editor-copy-link')!.addEventListener('click', () => { void this.exportLink(); });
    this.root.querySelector('#editor-copy-code')!.addEventListener('click', () => { void this.exportCode(); });
    this.root.querySelector('#editor-download')!.addEventListener('click', () => this.download());
    this.root.querySelector('#editor-import-btn')!.addEventListener('click', () => {
      this.importArea.value = '';
      this.importPanel.classList.remove('hidden');
    });
    this.root.querySelector('#editor-import-back')!.addEventListener('click', () => this.importPanel.classList.add('hidden'));
    this.root.querySelector('#editor-import-go')!.addEventListener('click', () => this.importFromText(this.importArea.value));

    this.titleInput.addEventListener('input', () => this.doc.setTitle(this.titleInput.value));
    this.seedInput.addEventListener('change', () => {
      const n = Number(this.seedInput.value);
      if (Number.isFinite(n)) {
        this.doc.setCosmeticSeed(n >>> 0);
        this.dotsKey = '';
        this.paint();
      }
    });
    this.root.querySelector('#editor-seed-rnd')!.addEventListener('click', () => {
      const n = (Math.random() * 0xffffffff) >>> 0;
      this.doc.setCosmeticSeed(n);
      this.seedInput.value = String(n);
      this.dotsKey = '';
      this.paint();
    });
    (this.root.querySelector('#editor-allguns') as HTMLInputElement).addEventListener('change', (e) => {
      this.allGuns = (e.target as HTMLInputElement).checked;
    });

    for (const b of Array.from(this.root.querySelectorAll<HTMLButtonElement>('.ed-tool'))) {
      b.addEventListener('click', () => this.setTool(b.dataset.tool as EditorTool));
    }

    const sel = (id: string, fn: (v: string) => void) => {
      this.root.querySelector(id)!.addEventListener('change', (e) => fn((e.target as HTMLSelectElement).value));
    };
    sel('#editor-kind', (v) => { this.roomKind = v as Room['kind']; });
    sel('#editor-theme', (v) => { this.theme = v as Theme; });
    sel('#editor-enemy', (v) => { this.enemyType = v as EnemyType; });
    sel('#editor-ammo', (v) => { this.ammoType = v as AmmoType; });
    sel('#editor-gun', (v) => { this.gunId = Number(v); });
    sel('#editor-sealbreak', (v) => {
      if (v === 'key') this.doc.setSealBreak({ type: 'key' });
      else this.doc.setSealBreak({ type: 'gun', gun: Number(v.slice(4)) });
    });
    (this.root.querySelector('#editor-outdoor') as HTMLInputElement).addEventListener('change', (e) => {
      this.outdoor = (e.target as HTMLInputElement).checked;
    });
    (this.root.querySelector('#editor-locked') as HTMLInputElement).addEventListener('change', (e) => {
      this.doorLocked = (e.target as HTMLInputElement).checked;
    });

    const wrap = this.root.querySelector('#editor-canvas-wrap')!;
    wrap.addEventListener('dragover', (e) => { e.preventDefault(); });
    wrap.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = (e as DragEvent).dataTransfer?.files?.[0];
      if (file) void this.importFile(file);
    });
  }

  private wireCanvas(): void {
    const cellAt = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      const { originX, originZ, cell } = this.layout();
      const x = Math.floor((e.clientX - r.left - originX) / cell);
      const z = Math.floor((e.clientY - r.top - originZ) / cell);
      if (x < 0 || z < 0 || x >= GRID_W || z >= GRID_H) return null;
      return { x, z };
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const c = cellAt(e);
      if (!c) return;
      this.canvas.setPointerCapture(e.pointerId);
      if (this.tool === 'room' || (this.tool === 'corridor' && !this.corrFirst)) {
        this.drag = { x0: c.x, z0: c.z, x1: c.x, z1: c.z };
      } else {
        this.applyClick(c.x, c.z);
      }
      this.paint();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const c = cellAt(e);
      if (!c) return;
      this.drag.x1 = c.x;
      this.drag.z1 = c.z;
      this.paint();
    });
    const endDrag = (e: PointerEvent) => {
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      const x0 = Math.min(d.x0, d.x1), z0 = Math.min(d.z0, d.z1);
      const w = Math.abs(d.x1 - d.x0) + 1, h = Math.abs(d.z1 - d.z0) + 1;
      if (this.tool === 'room') {
        const room = this.doc.stampRoom({
          x: x0, z: z0, w, h,
          kind: this.roomKind, theme: this.theme, outdoor: this.outdoor,
        });
        this.dotsKey = '';
        this.setStatus(room ? `room ${room.id} ${room.kind}` : 'room too small');
      } else if (this.tool === 'corridor') {
        if (w === 1 && h === 1 && !this.corrFirst) {
          this.corrFirst = { x: d.x0, z: d.z0 };
          this.setStatus('click a second room or cell');
        } else {
          const added = this.doc.applyCorridorClicks(d.x0, d.z0, d.x1, d.z1);
          this.corrFirst = null;
          this.dotsKey = '';
          this.setStatus(added.length ? `corridor ×${added.length}` : 'no corridor');
        }
      }
      this.paint();
      e.stopPropagation();
    };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', () => { this.drag = null; this.paint(); });
  }

  private applyClick(x: number, z: number): void {
    switch (this.tool) {
      case 'corridor':
        if (this.corrFirst) {
          const added = this.doc.applyCorridorClicks(this.corrFirst.x, this.corrFirst.z, x, z);
          this.corrFirst = null;
          this.dotsKey = '';
          this.setStatus(added.length ? `corridor ×${added.length}` : 'no corridor');
        } else {
          this.corrFirst = { x, z };
          this.setStatus('click a second room or cell');
        }
        break;
      case 'erase': {
        const what = this.doc.eraseAt(x, z);
        this.dotsKey = '';
        if (what === 'blocked-start') this.setStatus('cannot erase the only start');
        else this.setStatus(what ? `erased ${what}` : 'nothing there');
        break;
      }
      case 'door':
        this.doc.stampDoor(x, z, undefined, this.doorLocked);
        this.setStatus(this.doorLocked ? 'door (locked)' : 'door');
        break;
      case 'seal':
        this.doc.stampSeal(x, z);
        this.setStatus('seal override');
        break;
      case 'enemy':
        this.setStatus(this.doc.stampEnemy(this.enemyType, x, z) ? this.enemyType : 'need a room');
        break;
      case 'medikit':
        this.setStatus(this.doc.stampPickup({ kind: 'medikit', x, z }) ? 'medikit' : 'need a room');
        break;
      case 'ammo':
        this.setStatus(this.doc.stampPickup({ kind: 'ammo', ammoType: this.ammoType, x, z }) ? this.ammoType : 'need a room');
        break;
      case 'gun':
        this.setStatus(this.doc.stampPickup({ kind: 'gun', gun: this.gunId, x, z }) ? `gun ${this.gunId}` : 'need a room');
        break;
      case 'key':
        this.setStatus(this.doc.stampPickup({ kind: 'key', x, z }) ? 'key' : 'need a room');
        break;
      case 'start':
        this.doc.setPlayerStart(x, z);
        this.setStatus('player start');
        break;
      default:
        break;
    }
  }

  private setTool(tool: EditorTool): void {
    this.tool = tool;
    this.corrFirst = null;
    for (const b of Array.from(this.root.querySelectorAll<HTMLButtonElement>('.ed-tool'))) {
      b.classList.toggle('active', b.dataset.tool === tool);
    }
  }

  private syncForm(): void {
    this.titleInput.value = this.doc.bp.title ?? 'UNTITLED';
    this.seedInput.value = String(this.doc.bp.cosmeticSeed >>> 0);
    const sb = this.doc.bp.sealBreak;
    const sel = this.root.querySelector('#editor-sealbreak') as HTMLSelectElement;
    sel.value = sb.type === 'key' ? 'key' : `gun:${sb.gun}`;
    (this.root.querySelector('#editor-kind') as HTMLSelectElement).value = this.roomKind;
    (this.root.querySelector('#editor-theme') as HTMLSelectElement).value = this.theme;
    (this.root.querySelector('#editor-allguns') as HTMLInputElement).checked = this.allGuns;
  }

  private runValidate(announce: boolean): { errors: string[]; warnings: string[] } {
    const { errors, warnings } = this.doc.validate();
    const lines = [
      ...errors.map(e => `ERR ${e}`),
      ...warnings.map(w => `WARN ${w}`),
    ];
    this.setStatus(lines.length ? lines.join(' · ') : 'valid');
    if (announce) {
      this.host?.toast(errors.length ? `${errors.length} error(s)` : warnings.length ? 'valid (warnings)' : 'valid');
    }
    return { errors, warnings };
  }

  private blocked(): boolean {
    const { errors } = this.doc.validate();
    if (errors.length) {
      this.setStatus(errors.map(e => `ERR ${e}`).join(' · '));
      this.host?.toast('fix errors first');
      return true;
    }
    return false;
  }

  private tryPlaytest(): void {
    if (this.blocked()) return;
    this.host?.playtest(this.doc.snapshot(), this.allGuns);
  }

  private saveCurrent(): void {
    try {
      const code = encodeShareCodeSync(this.doc.bp);
      const title = this.doc.bp.title ?? 'UNTITLED';
      const list = upsertLibrary({ id: this.doc.libraryId ?? undefined, title, code });
      this.doc.libraryId = list[0]?.id ?? this.doc.libraryId;
      this.host?.toast('saved');
      this.setStatus(`saved · ${title}`);
    } catch {
      this.host?.toast('could not save');
    }
  }

  private openLibrary(): void {
    this.renderLibrary(loadLibrary());
    this.libPanel.classList.remove('hidden');
  }

  private renderLibrary(entries: LibraryEntry[]): void {
    this.libList.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'maplog-empty';
      empty.textContent = 'No saved maps yet.';
      this.libList.appendChild(empty);
      return;
    }
    for (const e of entries) {
      const row = document.createElement('div');
      row.className = 'maplog-entry';
      const meta = document.createElement('div');
      meta.className = 'maplog-meta';
      const title = document.createElement('span');
      title.className = 'maplog-seed';
      title.textContent = e.title;
      const time = document.createElement('span');
      time.className = 'maplog-time';
      time.textContent = new Date(e.savedAt).toLocaleString();
      meta.append(title, time);
      const actions = document.createElement('div');
      actions.className = 'row';
      const load = document.createElement('button');
      load.textContent = 'LOAD';
      load.addEventListener('click', () => {
        try {
          this.loadBlueprint(decodeShareCodeSync(e.code), e.id);
          this.libPanel.classList.add('hidden');
          this.host?.toast('loaded');
        } catch {
          this.host?.toast('could not load');
        }
      });
      actions.append(load);
      row.append(meta, actions);
      this.libList.appendChild(row);
    }
  }

  private importFromText(raw: string): void {
    let code = raw.trim();
    const hash = code.match(/#m=(SGMAP\.v1\.[A-Za-z0-9_-]+)/);
    if (hash) code = hash[1];
    if (!code.startsWith(MAP_CODE_PREFIX)) {
      this.host?.toast('not an SGMAP code');
      return;
    }
    try {
      this.loadBlueprint(decodeShareCodeSync(code));
      this.importPanel.classList.add('hidden');
      this.host?.toast('imported');
    } catch {
      this.host?.toast('could not import');
    }
  }

  private async importFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      this.importFromText(text);
    } catch {
      this.host?.toast('could not read file');
    }
  }

  private async exportLink(): Promise<void> {
    if (this.blocked()) return;
    const code = encodeShareCodeSync(this.doc.bp);
    const url = shareUrlFromCode(code);
    const ok = this.host ? await this.host.copyText(url) : false;
    this.host?.toast(ok ? 'link copied' : 'could not copy');
  }

  private async exportCode(): Promise<void> {
    if (this.blocked()) return;
    const code = encodeShareCodeSync(this.doc.bp);
    const ok = this.host ? await this.host.copyText(code) : false;
    this.host?.toast(ok ? 'code copied' : 'could not copy');
  }

  private download(): void {
    if (this.blocked()) return;
    const code = encodeShareCodeSync(this.doc.bp);
    const name = filenameFromTitle(this.doc.bp.title ?? 'untitled');
    const blob = new Blob([code], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    this.host?.toast('downloaded');
  }

  private setStatus(msg: string): void {
    this.status.textContent = msg;
  }

  private layout(): { cell: number; originX: number; originZ: number } {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const wrap = this.canvas.parentElement!;
    const cssW = wrap.clientWidth || 640;
    const cssH = wrap.clientHeight || 480;
    this.canvas.width = Math.floor(cssW * dpr);
    this.canvas.height = Math.floor(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    const cell = Math.floor(Math.min(this.canvas.width, this.canvas.height) / GRID_W);
    const originX = Math.floor((this.canvas.width - cell * GRID_W) / 2);
    const originZ = Math.floor((this.canvas.height - cell * GRID_H) / 2);
    return { cell, originX, originZ };
  }

  paint(): void {
    if (this.root.classList.contains('hidden')) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const { cell, originX, originZ } = this.layout();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0c0a0c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const px = (x: number, z: number, w = 1, h = 1) => {
      ctx.fillRect(originX + x * cell, originZ + z * cell, w * cell, h * cell);
    };

    ctx.fillStyle = '#16141a';
    ctx.fillRect(originX, originZ, GRID_W * cell, GRID_H * cell);

    for (const c of this.doc.bp.corridors) {
      ctx.fillStyle = '#2a2c28';
      px(c.x, c.z, c.w, c.h);
    }
    for (const r of this.doc.bp.rooms) {
      ctx.fillStyle = THEME_FILL[r.theme] ?? '#555';
      if (r.kind === 'arena') ctx.fillStyle = '#5a2028';
      if (r.kind === 'antechamber') ctx.fillStyle = '#204858';
      if (r.kind === 'start') ctx.fillStyle = '#4a4a20';
      px(r.x, r.z, r.w, r.h);
      ctx.strokeStyle = r.kind === 'start' ? '#ffe9a0' : 'rgba(0,0,0,0.35)';
      ctx.lineWidth = Math.max(1, cell * 0.12);
      ctx.strokeRect(originX + r.x * cell + 0.5, originZ + r.z * cell + 0.5, r.w * cell - 1, r.h * cell - 1);
      if (cell >= 6) {
        ctx.fillStyle = '#e8e4c8';
        ctx.font = `${Math.max(8, cell * 1.4)}px "Courier New", monospace`;
        ctx.fillText(r.kind.slice(0, 4), originX + r.x * cell + 2, originZ + r.z * cell + cell * 1.6);
      }
    }

    if (this.drag && this.tool === 'room') {
      const x = Math.min(this.drag.x0, this.drag.x1);
      const z = Math.min(this.drag.z0, this.drag.z1);
      const w = Math.abs(this.drag.x1 - this.drag.x0) + 1;
      const h = Math.abs(this.drag.z1 - this.drag.z0) + 1;
      ctx.fillStyle = 'rgba(255,200,80,0.25)';
      px(x, z, w, h);
    }
    if (this.drag && this.tool === 'corridor') {
      ctx.fillStyle = 'rgba(180,180,160,0.3)';
      const x = Math.min(this.drag.x0, this.drag.x1);
      const z = Math.min(this.drag.z0, this.drag.z1);
      px(x, z, Math.abs(this.drag.x1 - this.drag.x0) + 1, Math.abs(this.drag.z1 - this.drag.z0) + 1);
    }
    if (this.corrFirst) {
      ctx.fillStyle = '#ffe9a0';
      px(this.corrFirst.x, this.corrFirst.z);
    }

    for (const d of this.doc.bp.doors) {
      ctx.fillStyle = d.locked ? '#c8a050' : '#6a4030';
      px(d.cx, d.cz);
    }
    if (this.doc.bp.seal) {
      ctx.fillStyle = '#c040c0';
      for (const [x, z] of this.doc.bp.seal.cells) px(x, z);
    }

    const key = `${this.doc.bp.cosmeticSeed}|${this.doc.bp.rooms.length}|${this.doc.bp.corridors.length}`;
    if (key !== this.dotsKey) {
      this.dots = previewCosmeticDots(this.doc.bp);
      this.dotsKey = key;
    }
    for (const d of this.dots) {
      ctx.fillStyle = d.kind === 'light' ? '#ffe080' : '#9aa08e';
      const s = Math.max(1, cell * 0.28);
      ctx.beginPath();
      ctx.arc(originX + d.x * cell, originZ + d.z * cell, s, 0, Math.PI * 2);
      ctx.fill();
    }

    const mark = (x: number, z: number, color: string, ch: string) => {
      ctx.fillStyle = color;
      px(x, z);
      if (cell >= 8) {
        ctx.fillStyle = '#111';
        ctx.font = `${Math.max(8, cell * 0.9)}px "Courier New", monospace`;
        ctx.fillText(ch, originX + x * cell + 1, originZ + z * cell + cell * 0.85);
      }
    };
    for (const e of this.doc.bp.enemies) {
      const ch = e.type[0]!.toUpperCase();
      mark(e.x, e.z, '#c04030', ch);
    }
    for (const p of this.doc.bp.pickups) {
      if (p.kind === 'gun') mark(p.x, p.z, '#50c878', String(p.gun ?? ''));
      else if (p.kind === 'key') mark(p.x, p.z, '#e8d060', 'K');
      else if (p.kind === 'medikit') mark(p.x, p.z, '#e06060', '+');
      else mark(p.x, p.z, '#70a0d0', 'A');
    }
    if (this.doc.bp.playerStart) {
      mark(this.doc.bp.playerStart.x, this.doc.bp.playerStart.z, '#ffe9a0', 'P');
    }
  }
}
