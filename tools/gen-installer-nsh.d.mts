export interface AssocGroup {
  ext: string[]
  name: string
  description: string
}

export function readAssociations(yml?: string): AssocGroup[]
export function render(groups: AssocGroup[]): string
export const target: string
