import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { ClientEvent } from "@sidebar/shared";
import type { SidebarState } from "../ws";
import { SCENARIOS } from "../scenarios";
import { CustomSelect } from "./CustomSelect";

const DEFAULT_RAIL_ROWS = [1.8, 1, 0.7];
const MIN_PANEL_HEIGHTS = [180, 150, 120];
const KEY_RESIZE_STEP = 24;

export function Rail({ state, hostMode, send }: { state: SidebarState; hostMode: boolean; send: (e: ClientEvent) => void }) {
  const railRef = useRef<HTMLElement>(null);
  const [rows, setRows] = useState(DEFAULT_RAIL_ROWS);

  const getPanelHeights = useCallback(() => {
    const panels = railRef.current?.querySelectorAll<HTMLElement>(".panel");
    const heights = panels ? Array.from(panels, (panel) => panel.getBoundingClientRect().height) : [];
    return heights.length === 3 ? heights : rows;
  }, [rows]);

  const resizePair = useCallback((dividerIndex: number, delta: number, baseHeights: number[]) => {
    const next = [...baseHeights];
    const pairTotal = baseHeights[dividerIndex] + baseHeights[dividerIndex + 1];
    const minA = Math.min(MIN_PANEL_HEIGHTS[dividerIndex], pairTotal / 2);
    const minB = Math.min(MIN_PANEL_HEIGHTS[dividerIndex + 1], pairTotal - minA);
    const nextA = Math.max(minA, Math.min(baseHeights[dividerIndex] + delta, pairTotal - minB));

    next[dividerIndex] = nextA;
    next[dividerIndex + 1] = pairTotal - nextA;
    setRows(next);
  }, []);

  const startResize = useCallback(
    (dividerIndex: number, clientY: number) => {
      const startY = clientY;
      const startHeights = getPanelHeights();
      const onPointerMove = (event: PointerEvent) => {
        resizePair(dividerIndex, event.clientY - startY, startHeights);
      };
      const onPointerUp = () => {
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("pointercancel", onPointerUp);
        document.body.classList.remove("resizingRail");
      };

      document.body.classList.add("resizingRail");
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp, { once: true });
      document.addEventListener("pointercancel", onPointerUp, { once: true });
    },
    [getPanelHeights, resizePair],
  );

  const resizeWithKeyboard = (dividerIndex: number, event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    resizePair(dividerIndex, event.key === "ArrowDown" ? KEY_RESIZE_STEP : -KEY_RESIZE_STEP, getPanelHeights());
  };

  return (
    <aside className="rail" ref={railRef} style={{ gridTemplateRows: `${rows[0]}fr 12px ${rows[1]}fr 12px ${rows[2]}fr` }}>
      <Transcript state={state} hostMode={hostMode} send={send} />
      <div
        className="railResize"
        role="separator"
        aria-label="Resize live transcript and rolling summary"
        aria-orientation="horizontal"
        tabIndex={0}
        title="Drag to resize"
        onDoubleClick={() => setRows(DEFAULT_RAIL_ROWS)}
        onKeyDown={(event) => resizeWithKeyboard(0, event)}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          startResize(0, event.clientY);
        }}
      />
      <Summary state={state} />
      <div
        className="railResize"
        role="separator"
        aria-label="Resize rolling summary and fact-check"
        aria-orientation="horizontal"
        tabIndex={0}
        title="Drag to resize"
        onDoubleClick={() => setRows(DEFAULT_RAIL_ROWS)}
        onKeyDown={(event) => resizeWithKeyboard(1, event)}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          startResize(1, event.clientY);
        }}
      />
      <FactCheck state={state} />
    </aside>
  );
}

function Transcript({ state, hostMode, send }: { state: SidebarState; hostMode: boolean; send: (e: ClientEvent) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [state.transcript.length]);
  return (
    <div className="panel">
      <div className="panel-h">
        Live transcript
        <span className="ph-spacer" />
        {hostMode ? (
          <span className="demoPick">
            <span className="demoK">demo</span>
            <CustomSelect
              className="scenarioSelect"
              value={state.scenarioId ?? ""}
              onChange={(val) => send({ type: "start", scenarioId: val })}
              ariaLabel="Demo scenario"
              title="Switch demo scenario"
              placeholder="Pick a demo…"
              options={SCENARIOS.map((sc) => ({ value: sc.id, label: sc.title }))}
            />
          </span>
        ) : null}
        <span className="rec" />
      </div>
      <div className="panel-b trans" ref={ref}>
        {state.transcript.length === 0 && <div className="empty">Waiting for the meeting…</div>}
        {state.transcript.map((l) => {
          // Router decisions are operator insight — keep them out of the participants' read.
          if (l.kind === "router" && l.router) {
            if (!hostMode) return null;
            return (
              <div key={l.id} className="line router">
                <b>&rarr; router</b>&nbsp; prototype{" "}
                <span className={l.router.proto ? "y" : "n"}>{l.router.proto ? "fire" : "skip"}</span> &middot; summary{" "}
                <span className={l.router.summary ? "y" : "n"}>{l.router.summary ? "update" : "skip"}</span> &middot; factcheck{" "}
                <span className={l.router.fact ? "y" : "n"}>{l.router.fact ? "fire" : "skip"}</span>
                {l.router.screen ? (
                  <>
                    {" "}
                    &middot; <span className="y">+screenshot</span>
                  </>
                ) : null}
              </div>
            );
          }
          return (
            <div key={l.id} className={"line" + (l.kind === "partial" ? " partial" : "")}>
              <span className="sp">{l.speaker ?? "…"}</span>
              {l.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Summary({ state }: { state: SidebarState }) {
  const s = state.summary;
  return (
    <div className="panel">
      <div className="panel-h">
        Rolling summary <span className="tag sum">summarizer</span>
      </div>
      <div className="panel-b">
        <div className="sum-tldr">
          <span className="k">TL;DR</span>
          {s?.tldr ?? "Listening…"}
        </div>
        <Sec cls="" title="Decisions" items={s?.decisions ?? []} render={(d) => d} />
        <Sec
          cls="act"
          title="Action items"
          items={s?.action_items ?? []}
          render={(a) => (
            <>
              <span className="owner">{a.owner}</span>
              {a.task}
            </>
          )}
        />
        <Sec cls="open" title="Open questions" items={s?.open_questions ?? []} render={(q) => q} />
      </div>
    </div>
  );
}

function Sec<T>({
  cls,
  title,
  items,
  render,
}: {
  cls: string;
  title: string;
  items: T[];
  render: (x: T) => ReactNode;
}) {
  return (
    <div className={"sum-sec " + cls}>
      <h4>{title}</h4>
      {items.length ? (
        <ul>
          {items.map((it, i) => (
            <li key={i}>{render(it)}</li>
          ))}
        </ul>
      ) : (
        <div className="empty">—</div>
      )}
    </div>
  );
}

function FactCheck({ state }: { state: SidebarState }) {
  return (
    <div className="panel">
      <div className="panel-h">
        Fact-check <span className="tag fc">factcheck</span>
      </div>
      <div className="panel-b">
        {state.factchecks.length === 0 && <div className="empty">No checkable claims yet.</div>}
        {state.factchecks.map((f, i) => (
          <div className="fc" key={i}>
            <div className="claim">&ldquo;{f.claim}&rdquo;</div>
            <div className="row">
              <span className={"verdict v-" + f.verdict}>{f.verdict}</span>
              <span className="conf">confidence {f.confidence}</span>
              <span className="src">&#128279; {f.source}</span>
            </div>
            {f.note && <div className="note">{f.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
