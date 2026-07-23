import { useEffect, useState } from "react";
import { isMobileViewport, MOBILE_MQ } from "../lib/mobile";

/** True when the viewport matches the app's mobile layout breakpoint. */
export function useMobileLayout(): boolean {
  const [mobile, setMobile] = useState(isMobileViewport);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return mobile;
}
