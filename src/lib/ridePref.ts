import type { LatLng } from './types'

/** Which ride app "Get a ride" opens. Kept on this device (it's a phone-level choice). */
export type RideApp = 'uber' | 'lyft'

const KEY = 'tether.rideApp'

export function getRideApp(): RideApp {
  try {
    return localStorage.getItem(KEY) === 'lyft' ? 'lyft' : 'uber'
  } catch {
    return 'uber'
  }
}

export function setRideApp(app: RideApp) {
  try {
    localStorage.setItem(KEY, app)
  } catch {
    // ignore
  }
}

/**
 * Deep link that opens the ride app (or its mobile site) with pickup here and
 * drop-off at home when known.
 */
export function rideUrl(app: RideApp, from: LatLng | null, home: LatLng | null, homeAddress: string | null): string {
  if (app === 'lyft') {
    return `https://lyft.com/ride?id=lyft${from ? `&pickup[latitude]=${from.lat}&pickup[longitude]=${from.lng}` : ''}${
      home ? `&destination[latitude]=${home.lat}&destination[longitude]=${home.lng}` : ''
    }`
  }
  const addr = encodeURIComponent(homeAddress ?? 'Home')
  return `https://m.uber.com/ul/?action=setPickup${
    from ? `&pickup[latitude]=${from.lat}&pickup[longitude]=${from.lng}` : '&pickup=my_location'
  }${
    home
      ? `&dropoff[latitude]=${home.lat}&dropoff[longitude]=${home.lng}&dropoff[nickname]=Home&dropoff[formatted_address]=${addr}`
      : ''
  }`
}
