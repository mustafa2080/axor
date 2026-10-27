import { useState } from 'react'
import { createSingleFlight } from './single-flight.ts'

/** قفل «عملية واحدة في المرة» ثابت طول عمر الـ component (راجع single-flight.ts). */
export function useSingleFlight() {
  return useState(createSingleFlight)[0]
}
