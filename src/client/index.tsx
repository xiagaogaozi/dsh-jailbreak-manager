/** Browser plugin for dsh-jailbreak-manager: the 「破限词」 settings page. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Module-loading import: the settings-section slot lives in the shell contract.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { JailbreakManagerPage } from './JailbreakManagerPage.tsx'

/** Required services: slots (settings section registration). */
export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  // 「破限词」settings page: manage the md wordbook and model selection.
  ctx.slots.inject('settings.section' as any, () => ctx.slots.register({
    name: 'settings.section' as any,
    id: 'dsh-jailbreak-manager',
    order: 52,
    label: () => '破限词',
  }, JailbreakManagerPage))
}
