import { AIRLINE_DOMAINS, TRAVEL_AGENCY_DOMAINS } from '../data/airlines';

/** Bump when the built-in searches change, so the next sync re-reads every matching email. */
export const BUILTIN_SEARCH_VERSION = 2;

/** Subject words of booking emails in English, Spanish, Portuguese, Italian, French and German. */
const SUBJECT_TERMS = [
  'flight', 'flights', 'vuelo', 'vuelos', 'voo', 'voos', 'volo', 'voli', 'vol', 'vols', 'flug', 'itinerary', 'itinerario',
  'itinerário', 'itinéraire', '"boarding pass"', '"pase de abordar"', '"tarjeta de embarque"', '"cartão de embarque"',
  '"carta d\'imbarco"', '"carte d\'embarquement"', 'e-ticket', 'eticket', '"booking confirmation"', '"trip confirmation"',
  '"travel confirmation"', 'confirmación', 'confirmacion', 'confirmação', 'conferma', 'reservation', 'reservación', 'reserva',
  'prenotazione', 'réservation', 'buchung', 'buchungsbestätigung', '"check-in"', '"check in"', '"your trip"', '"tu viaje"',
  '"sua viagem"', '"il tuo viaggio"', '"votre voyage"', 'pasaje', 'passagem', 'billete', 'biglietto', 'billet',
];

const chunk = <T>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

/**
 * The searches a sync runs when the user hasn't set their own: booking-style subjects, mail from
 * airlines and travel agencies, and Gmail's own Reservations category. Several short queries
 * rather than one huge one keep each under Gmail's query length limits; results are combined.
 */
export function builtinQueries(): string[] {
  const senders = [...new Set([...Object.keys(AIRLINE_DOMAINS), ...TRAVEL_AGENCY_DOMAINS])];
  return [
    `subject:(${SUBJECT_TERMS.join(' OR ')}) -category:social`,
    ...chunk(senders, 30).map((group) => `from:(${group.join(' OR ')})`),
    'category:reservations',
  ];
}

/** The Gmail searches for a sync: the user's own query if they set one, otherwise the built-in set. */
export function syncQueries(customQuery: string): string[] {
  return customQuery.trim() ? [customQuery.trim()] : builtinQueries();
}
