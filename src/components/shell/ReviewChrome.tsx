import { useProjectStore } from "../../store/projectStore";
import { useUiStore } from "../../store/uiStore";
import { useMobileLayout } from "../../hooks/useMobileLayout";
import { t } from "../../i18n";

/** Folder — project panel affordance. */
function ProjectIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

/** Stacked layers — common map UI affordance. */
function LayersIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  );
}

/** Thin Review hub chrome: name + Project / Layers / Edit icons. */
export function ReviewChrome() {
  const screen = useUiStore((s) => s.screen);
  const dispatch = useUiStore((s) => s.dispatch);
  const name = useProjectStore((s) => s.project.name);
  const mobile = useMobileLayout();

  const hideChrome =
    screen.kind === "empty" ||
    screen.kind === "createWizard" ||
    screen.kind === "georef";

  if (hideChrome) return null;

  const inTool = screen.kind === "editPlan" || screen.kind === "editComment";
  if (inTool) return null;

  return (
    <header className={`review-chrome${mobile ? " review-chrome--mobile" : ""}`}>
      <span className="review-chrome-name" title={name}>
        {name || t("common.untitled")}
      </span>
      <div className="review-chrome-actions">
        <button
          type="button"
          title={t("review.project")}
          aria-label={t("review.project")}
          className={screen.kind === "project" ? "active" : ""}
          onClick={() =>
            dispatch(
              screen.kind === "project"
                ? { type: "DISMISS" }
                : { type: "OPEN_PROJECT" },
            )
          }
        >
          <ProjectIcon />
        </button>
        <button
          type="button"
          title={t("review.layers")}
          aria-label={t("review.layers")}
          className={screen.kind === "layers" ? "active" : ""}
          onClick={() =>
            dispatch(
              screen.kind === "layers"
                ? { type: "DISMISS" }
                : { type: "OPEN_LAYERS" },
            )
          }
        >
          <LayersIcon />
        </button>
        <button
          type="button"
          title={t("review.edit")}
          aria-label={t("review.edit")}
          onClick={() => dispatch({ type: "OPEN_EDIT_MENU" })}
        >
          ✎
        </button>
      </div>
    </header>
  );
}
