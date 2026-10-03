import type { PlaceKind } from '@/lib/nightDraft'
import { BeerIcon, CocktailIcon, ForkKnifeIcon, MusicIcon, PinIcon } from './icons'

/** Type icon for a suggested venue (bar / pub / club / restaurant). */
export function PlaceKindIcon({ kind, size = 20 }: { kind?: PlaceKind; size?: number }) {
  const p = { width: size, height: size }
  switch (kind) {
    case 'bar':
      return <CocktailIcon {...p} />
    case 'pub':
      return <BeerIcon {...p} />
    case 'nightclub':
      return <MusicIcon {...p} />
    case 'restaurant':
      return <ForkKnifeIcon {...p} />
    default:
      return <PinIcon {...p} />
  }
}
