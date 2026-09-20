'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './cloud-map.module.css';

type Service = {
  name: string;
  region: string;
  uri: string | null;
  generation: string | null;
  latestReadyRevision: string | null;
  revisionImage: string | null;
};

type Vm = {
  id: string;
  name: string;
  zone: string;
  status: string;
  machineType: string;
  internalIp: string | null;
  externalIp: string | null;
};

type Deployment = {
  service: string;
  region: string;
  sourceSha: string | null;
  sourceUrl: string | null;
  buildId: string | null;
  buildStatus: string | null;
  buildLogUrl: string | null;
  digest: string | null;
  revision: string | null;
  url: string | null;
  provenance: 'VERIFIED' | 'UNKNOWN';
  reasons: string[];
};

type Props = {
  services: Service[];
  vms: Vm[];
  deployments: Deployment[];
  projectId: string;
};

type MapNode = {
  id: string;
  label: string;
  kind: 'run' | 'vm' | 'deploy';
  x: number;
  y: number;
  status: string;
  meta: string;
  href?: string | null;
};

type Camera = { x: number; y: number; zoom: number };

function hash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nodeStatus(kind: MapNode['kind'], raw: string) {
  if (kind === 'vm') return /RUNNING/i.test(raw) ? 'LIVE' : raw || 'UNKNOWN';
  if (kind === 'run') return raw || 'UNKNOWN';
  return raw || 'UNKNOWN';
}

export default function CloudMap2D({ services, vms, deployments, projectId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 0.84 });
  const dragRef = useRef<{ active: boolean; x: number; y: number; cx: number; cy: number }>({ active: false, x: 0, y: 0, cx: 0, cy: 0 });
  const touchDistanceRef = useRef<number | null>(null);
  const [selected, setSelected] = useState<MapNode | null>(null);
  const [hovered, setHovered] = useState<MapNode | null>(null);
  const [cameraLabel, setCameraLabel] = useState('0 / 0 / 84%');

  const nodes = useMemo<MapNode[]>(() => {
    const used = new Set<string>();
    const place = (id: string, kind: MapNode['kind'], idx: number, total: number) => {
      const r = mulberry32(hash(id));
      const band = kind === 'run' ? 420 : kind === 'vm' ? 720 : 930;
      const angle = (idx / Math.max(total, 1)) * Math.PI * 2 + r() * 0.9;
      const radius = band + (r() - 0.5) * 260;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.68 };
    };

    const runNodes = services.map((service, i) => {
      used.add(`run:${service.region}:${service.name}`);
      const p = place(service.name + service.region, 'run', i, services.length);
      return {
        id: `run:${service.region}:${service.name}`,
        label: service.name,
        kind: 'run' as const,
        x: p.x,
        y: p.y,
        status: nodeStatus('run', service.latestReadyRevision ? 'LIVE' : 'UNKNOWN'),
        meta: `${service.region} · ${service.latestReadyRevision ?? 'revision UNKNOWN'}`,
        href: service.uri,
      };
    });

    const vmNodes = vms.map((vm, i) => {
      const p = place(vm.name + vm.zone, 'vm', i, vms.length);
      return {
        id: `vm:${vm.id}`,
        label: vm.name,
        kind: 'vm' as const,
        x: p.x,
        y: p.y,
        status: nodeStatus('vm', vm.status),
        meta: `${vm.zone} · ${vm.machineType}`,
        href: `https://console.cloud.google.com/compute/instancesDetail/zones/${encodeURIComponent(vm.zone)}/instances/${encodeURIComponent(vm.name)}?project=${encodeURIComponent(projectId)}`,
      };
    });

    const orphanDeployments = deployments
      .filter((dep) => !used.has(`run:${dep.region}:${dep.service}`))
      .map((dep, i, all) => {
        const p = place(dep.service + dep.region + (dep.sourceSha ?? ''), 'deploy', i, all.length);
        return {
          id: `deploy:${dep.region}:${dep.service}`,
          label: dep.service,
          kind: 'deploy' as const,
          x: p.x,
          y: p.y,
          status: dep.provenance,
          meta: `${dep.region} · ${dep.revision ?? 'revision UNKNOWN'}`,
          href: dep.url,
        };
      });

    return [...runNodes, ...vmNodes, ...orphanDeployments];
  }, [services, vms, deployments, projectId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    const dust = Array.from({ length: 170 }, (_, i) => {
      const r = mulberry32(0x05a + i + 1);
      return {
        x: (r() - 0.5) * 4200,
        y: (r() - 0.5) * 2800,
        a: 0.13 + r() * 0.38,
        s: 0.4 + r() * 1.25,
      };
    });

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const toScreen = (x: number, y: number) => {
      const c = cameraRef.current;
      return [(x - c.x) * c.zoom + width / 2, (y - c.y) * c.zoom + height / 2] as const;
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height);
      const bg = ctx.createRadialGradient(width * 0.58, height * 0.36, 0, width * 0.58, height * 0.36, Math.max(width, height) * 0.78);
      bg.addColorStop(0, 'rgba(86,66,176,.18)');
      bg.addColorStop(0.42, 'rgba(24,29,42,.96)');
      bg.addColorStop(1, 'rgba(6,7,10,1)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      const c = cameraRef.current;
      for (const star of dust) {
        const [sx, sy] = toScreen(star.x, star.y);
        if (sx < -5 || sx > width + 5 || sy < -5 || sy > height + 5) continue;
        ctx.fillStyle = `rgba(160,174,211,${star.a})`;
        ctx.fillRect(sx, sy, star.s, star.s);
      }

      ctx.strokeStyle = 'rgba(142,121,255,.075)';
      ctx.lineWidth = 1;
      const grid = 180 * c.zoom;
      if (grid > 35) {
        const ox = ((-c.x * c.zoom + width / 2) % grid + grid) % grid;
        const oy = ((-c.y * c.zoom + height / 2) % grid + grid) % grid;
        for (let x = ox; x < width; x += grid) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }
        for (let y = oy; y < height; y += grid) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }
      }

      const [cx, cy] = toScreen(0, 0);
      const coreR = Math.max(34, 54 * c.zoom);
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.4);
      coreGlow.addColorStop(0, 'rgba(103,232,180,.23)');
      coreGlow.addColorStop(1, 'rgba(103,232,180,0)');
      ctx.fillStyle = coreGlow;
      ctx.beginPath(); ctx.arc(cx, cy, coreR * 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(103,232,180,.5)';
      ctx.beginPath(); ctx.arc(cx, cy, coreR + Math.sin(now / 900) * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(15,24,27,.95)';
      ctx.beginPath(); ctx.arc(cx, cy, coreR * 0.72, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#aef9d7';
      ctx.font = '700 10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('GCP CORE', cx, cy + 3);

      for (const node of nodes) {
        const [sx, sy] = toScreen(node.x, node.y);
        if (sx < -120 || sx > width + 120 || sy < -120 || sy > height + 120) continue;

        ctx.strokeStyle = node.kind === 'vm' ? 'rgba(111,215,255,.11)' : 'rgba(142,121,255,.12)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(sx, sy); ctx.stroke();

        const active = selected?.id === node.id || hovered?.id === node.id;
        const radius = (node.kind === 'vm' ? 19 : 23) * Math.max(0.82, Math.min(c.zoom, 1.45));
        const color = node.kind === 'vm' ? '#6fd7ff' : node.kind === 'deploy' ? '#f2c46d' : '#9d8cff';

        if (active) {
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.48;
          ctx.beginPath(); ctx.arc(sx, sy, radius + 9 + Math.sin(now / 320) * 2, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
        }

        ctx.fillStyle = 'rgba(12,15,21,.97)';
        ctx.strokeStyle = color;
        ctx.lineWidth = active ? 2 : 1.2;
        ctx.beginPath(); ctx.arc(sx, sy, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

        ctx.fillStyle = color;
        ctx.globalAlpha = /LIVE|RUNNING|VERIFIED/i.test(node.status) ? 0.96 : 0.48;
        ctx.beginPath(); ctx.arc(sx, sy, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = active ? '#f4f7fb' : '#a9afba';
        ctx.font = active ? '700 11px system-ui' : '600 10px system-ui';
        ctx.textAlign = 'center';
        const label = node.label.length > 24 ? `${node.label.slice(0, 22)}…` : node.label;
        ctx.fillText(label, sx, sy + radius + 18);
      }

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [nodes, selected, hovered]);

  const pointToWorld = (clientX: number, clientY: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return { x: 0, y: 0 };
    const rect = wrap.getBoundingClientRect();
    const c = cameraRef.current;
    return {
      x: (clientX - rect.left - rect.width / 2) / c.zoom + c.x,
      y: (clientY - rect.top - rect.height / 2) / c.zoom + c.y,
    };
  };

  const pick = (clientX: number, clientY: number) => {
    const p = pointToWorld(clientX, clientY);
    const c = cameraRef.current;
    let best: MapNode | null = null;
    let bestD = 42 / c.zoom;
    for (const node of nodes) {
      const d = Math.hypot(node.x - p.x, node.y - p.y);
      if (d < bestD) {
        best = node;
        bestD = d;
      }
    }
    return best;
  };

  const updateLabel = () => {
    const c = cameraRef.current;
    setCameraLabel(`${Math.round(c.x)} / ${Math.round(c.y)} / ${Math.round(c.zoom * 100)}%`);
  };

  const resetCamera = () => {
    cameraRef.current = { x: 0, y: 0, zoom: 0.84 };
    updateLabel();
    setSelected(null);
  };

  return (
    <section className={styles.page}>
      <div className={styles.intro}>
        <div>
          <span>LIVE INVENTORY // SPATIAL CONTROL</span>
          <h2>Cloud Map 2D</h2>
          <p>Wyciągnięty widok mapy OSA, przepięty na realne dane Cloud Workspace. Cloud Run, VM i orphan deployments bez tworzenia fikcyjnych zasobów.</p>
        </div>
        <div className={styles.metrics}>
          <div><b>{services.length}</b><span>Cloud Run</span></div>
          <div><b>{vms.length}</b><span>VM</span></div>
          <div><b>{deployments.length}</b><span>Deployments</span></div>
        </div>
      </div>

      <div className={styles.mapShell}>
        <div className={styles.mapToolbar}>
          <div><span>PROJECT</span><b>{projectId}</b></div>
          <div className={styles.legend}>
            <span><i className={styles.runDot} /> RUN</span>
            <span><i className={styles.vmDot} /> VM</span>
            <span><i className={styles.deployDot} /> DEPLOY</span>
          </div>
          <button onClick={resetCamera}>Reset mapy</button>
        </div>

        <div
          className={styles.canvasWrap}
          ref={wrapRef}
          onPointerDown={(event) => {
            if (event.pointerType === 'touch') return;
            dragRef.current = { active: true, x: event.clientX, y: event.clientY, cx: cameraRef.current.x, cy: cameraRef.current.y };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!dragRef.current.active) {
              setHovered(pick(event.clientX, event.clientY));
              return;
            }
            const d = dragRef.current;
            const c = cameraRef.current;
            c.x = d.cx - (event.clientX - d.x) / c.zoom;
            c.y = d.cy - (event.clientY - d.y) / c.zoom;
            updateLabel();
          }}
          onPointerUp={(event) => {
            const wasDrag = dragRef.current.active && Math.hypot(event.clientX - dragRef.current.x, event.clientY - dragRef.current.y) > 6;
            dragRef.current.active = false;
            if (!wasDrag) setSelected(pick(event.clientX, event.clientY));
          }}
          onPointerLeave={() => { dragRef.current.active = false; setHovered(null); }}
          onWheel={(event) => {
            event.preventDefault();
            const before = pointToWorld(event.clientX, event.clientY);
            const c = cameraRef.current;
            const factor = Math.exp(-event.deltaY * 0.0014);
            c.zoom = Math.max(0.28, Math.min(2.4, c.zoom * factor));
            const after = pointToWorld(event.clientX, event.clientY);
            c.x += before.x - after.x;
            c.y += before.y - after.y;
            updateLabel();
          }}
          onTouchStart={(event) => {
            if (event.touches.length === 1) {
              const t = event.touches[0];
              dragRef.current = { active: true, x: t.clientX, y: t.clientY, cx: cameraRef.current.x, cy: cameraRef.current.y };
              touchDistanceRef.current = null;
            } else if (event.touches.length === 2) {
              const [a, b] = [event.touches[0], event.touches[1]];
              touchDistanceRef.current = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
              dragRef.current.active = false;
            }
          }}
          onTouchMove={(event) => {
            event.preventDefault();
            if (event.touches.length === 1 && dragRef.current.active) {
              const t = event.touches[0];
              const c = cameraRef.current;
              c.x = dragRef.current.cx - (t.clientX - dragRef.current.x) / c.zoom;
              c.y = dragRef.current.cy - (t.clientY - dragRef.current.y) / c.zoom;
              updateLabel();
            } else if (event.touches.length === 2 && touchDistanceRef.current) {
              const [a, b] = [event.touches[0], event.touches[1]];
              const next = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
              const c = cameraRef.current;
              c.zoom = Math.max(0.28, Math.min(2.4, c.zoom * (next / touchDistanceRef.current)));
              touchDistanceRef.current = next;
              updateLabel();
            }
          }}
          onTouchEnd={(event) => {
            if (event.touches.length === 0) {
              dragRef.current.active = false;
              touchDistanceRef.current = null;
            }
          }}
        >
          <canvas ref={canvasRef} className={styles.canvas} />
          <div className={styles.coords}>{cameraLabel}</div>
          {nodes.length === 0 && (
            <div className={styles.empty}>
              <strong>MAPA CZEKA NA INVENTORY</strong>
              <span>Brak potwierdzonych Cloud Run / VM / deployment nodes. Niczego nie generuję z nazwy projektu.</span>
            </div>
          )}
        </div>

        <aside className={styles.details}>
          {selected ? (
            <>
              <span>{selected.kind.toUpperCase()}</span>
              <h3>{selected.label}</h3>
              <div className={styles.statusRow}><i className={styles.statusPulse} /><b>{selected.status}</b></div>
              <p>{selected.meta}</p>
              <dl>
                <div><dt>ID</dt><dd>{selected.id}</dd></div>
                <div><dt>Evidence</dt><dd>LIVE WORKSPACE INVENTORY</dd></div>
              </dl>
              {selected.href ? <a href={selected.href} target="_blank" rel="noreferrer">Otwórz zasób ↗</a> : <button disabled>URL UNKNOWN</button>}
            </>
          ) : (
            <>
              <span>NODE INSPECTOR</span>
              <h3>Wybierz zasób</h3>
              <p>Przeciągnij mapę, użyj scroll/pinch do zoomu i dotknij węzła, aby zobaczyć evidence.</p>
              <dl>
                <div><dt>Źródło</dt><dd>/api/gcp/*</dd></div>
                <div><dt>Tryb</dt><dd>READ ONLY</dd></div>
              </dl>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
