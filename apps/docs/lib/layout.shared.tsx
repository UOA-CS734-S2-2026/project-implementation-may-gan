import Image from "next/image";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { appName, gitConfig } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      // JSX supported
      title: (
        <span className="flex items-center gap-2">
          <Image
            src="/dayli-icon.png"
            alt=""
            aria-hidden="true"
            width={24}
            height={24}
            className="size-6 rounded-full"
          />
          <span>Dayli Docs</span>
        </span>
      ),
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
