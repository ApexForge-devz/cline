# Session UI Overhaul

The Session composer uses an adaptive HUD: always-visible controls stay compact while detailed controls live in contextual popovers or transient activity strips.

## Visual contract
- Quiet idle state; dense only when useful.
- Existing Cline/Tailwind tokens are preferred over bespoke colors.
- Controls use consistent 28px height, compact typography, focus rings, hover/pressed feedback, and short transitions.
- Popovers own detail; the composer remains the primary visual focus.
- State changes should animate without creating layout jumps.
- Provider-specific controls stay behind advanced surfaces.

## Delivery phases
0. Design foundation and shared HUD primitives.
1. Adaptive Session HUD shell.
2. Configurable Quick Prompts.
3. Model + reasoning HUD.
4. Context HUD and context inspector.
5. Manual/automatic compaction UX.
6. Adaptive tool activity.
7. Session actions.
8. Prompt history.
9. Attach-context workflow.
10. Session bookmarks and branching.
11. Session health diagnostics.
12. Advanced runtime panel.
13. Visual polish and micro-interactions.
14. Responsive/accessibility pass.
15. Full regression and performance validation.
