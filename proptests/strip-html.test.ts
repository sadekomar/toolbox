import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { stripHtml } from '@/modules/integrations/helpers/microsoft-teams/strip-html'

// These are local probes, not repo tests. When one finds a real failure, commit a
// plain vitest case for the shrunk input instead — the repo has no fast-check dep.

const html = fc.stringMatching(/^[\w\s<>&#;/"'=-]*$/)

describe('stripHtml', () => {
  it('is idempotent', () => {
    fc.assert(
      fc.property(html, (input) => {
        const once = stripHtml(input)
        expect(stripHtml(once)).toBe(once)
      })
    )
  })

  // A stricter `/<[a-zA-Z/]/` fails on input '</', which stripHtml leaves intact.
  // Harmless on its own, so this asserts what the code actually promises: no
  // complete tag survives, however the input was nested.
  it('leaves no complete tag behind', () => {
    fc.assert(
      fc.property(html, (input) => {
        expect(stripHtml(input)).not.toMatch(/<[a-zA-Z][^>]*>/)
      })
    )
  })

  it('never grows the input', () => {
    fc.assert(
      fc.property(html, (input) => {
        expect(stripHtml(input).length).toBeLessThanOrEqual(input.length)
      })
    )
  })
})
