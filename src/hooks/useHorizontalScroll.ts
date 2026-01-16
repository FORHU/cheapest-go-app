import { useRef, useCallback } from "react";

interface UseHorizontalScrollOptions {
  scrollAmount?: number;
}

export const useHorizontalScroll = (
  options: UseHorizontalScrollOptions = {}
) => {
  const { scrollAmount = 340 } = options;
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = useCallback(
    (direction: "left" | "right") => {
      if (scrollRef.current) {
        scrollRef.current.scrollBy({
          left: direction === "left" ? -scrollAmount : scrollAmount,
          behavior: "smooth",
        });
      }
    },
    [scrollAmount]
  );

  const scrollLeft = useCallback(() => scroll("left"), [scroll]);
  const scrollRight = useCallback(() => scroll("right"), [scroll]);

  return {
    scrollRef,
    scroll,
    scrollLeft,
    scrollRight,
  };
};
