/**
 * Curated, verified photography the agent can reference as `library:<key>`.
 * Models reliably hallucinate stock-photo URLs; keys keep generated sites free
 * of broken images until the owner uploads their own media.
 */
export interface LibraryImage {
  key: string;
  id: string;
  alt: string;
  tags: string[];
}

export const IMAGE_LIBRARY: LibraryImage[] = [
  { key: 'resort-lodge-pool', id: '1566073771259-6a8506099945', alt: 'Timber lodge beside an infinity pool with sun loungers at dusk', tags: ['resort', 'pool', 'hospitality', 'luxury', 'exterior'] },
  { key: 'resort-pool-night', id: '1542314831-068cd1dbfeeb', alt: 'Resort pool glowing under a blue evening sky', tags: ['resort', 'pool', 'night', 'hotel'] },
  { key: 'hotel-pool-reflection', id: '1571896349842-33c89424de2d', alt: 'Modern hotel façade reflected in a still pool at twilight', tags: ['hotel', 'pool', 'architecture', 'luxury'] },
  { key: 'room-balcony', id: '1582719478250-c89cae4dc85b', alt: 'Sunlit guest room with a wide bed and balcony doors', tags: ['room', 'hotel', 'accommodation', 'bright'] },
  { key: 'suite-classic', id: '1590490360182-c33d57733427', alt: 'Classic suite with a sofa, soft lamps and a made bed', tags: ['suite', 'room', 'hotel', 'accommodation'] },
  { key: 'room-warm', id: '1618773928121-c32242e63f39', alt: 'Warmly lit hotel room with crisp white linens', tags: ['room', 'hotel', 'accommodation', 'evening'] },
  { key: 'spa-massage', id: '1544161515-4ab6ce6db874', alt: 'Therapist pouring warm oil during a massage', tags: ['spa', 'wellness', 'massage'] },
  { key: 'spa-amenities', id: '1540555700478-4be289fbecef', alt: 'Rolled towel, lotion and tulips arranged for a spa treatment', tags: ['spa', 'wellness', 'amenities', 'minimal'] },
  { key: 'restaurant-moody', id: '1517248135467-4c7edcad34c4', alt: 'Moody restaurant dining room with pendant lights', tags: ['restaurant', 'dining', 'interior'] },
  { key: 'fine-dining', id: '1414235077428-338989a2e8c0', alt: 'Plated dish and wine glasses on a candlelit table', tags: ['restaurant', 'dining', 'food', 'fine dining'] },
  { key: 'food-flatlay', id: '1504674900247-0877df9cc836', alt: 'Overhead view of colourful plates with herbs and chilli', tags: ['food', 'restaurant', 'cuisine'] },
  { key: 'himalaya-trail', id: '1544735716-392fe2489ffa', alt: 'Snow-capped Himalayan peaks above a forested trail', tags: ['nepal', 'himalaya', 'mountains', 'trek', 'landscape'] },
  { key: 'mountain-sunrise', id: '1506905925346-21bda4d32df4', alt: 'Mountain ridges rising above a sea of clouds at sunrise', tags: ['mountains', 'sunrise', 'landscape', 'view'] },
  { key: 'alpine-valley', id: '1464822759023-fed622ff2c3b', alt: 'Alpine valley with pine forest and distant snowy peaks', tags: ['mountains', 'valley', 'nature', 'landscape'] },
  { key: 'lake-turquoise', id: '1501785888041-af3ef285b470', alt: 'Rowing boat on a turquoise lake between steep mountains', tags: ['lake', 'mountains', 'nature', 'boat'] },
  { key: 'wedding-bouquet', id: '1519741497674-611481863552', alt: 'Bride holding a bouquet in soft evening light', tags: ['wedding', 'bride', 'flowers'] },
  { key: 'wedding-ceremony', id: '1511285560929-80b456fea0bc', alt: 'Couple at an outdoor ceremony with balloons and blooms', tags: ['wedding', 'ceremony', 'celebration', 'event'] },
  { key: 'wedding-rings', id: '1465495976277-4387d4b0b4c6', alt: 'Close-up of hands with wedding rings and a corsage', tags: ['wedding', 'rings', 'detail'] },
  { key: 'banquet-hall', id: '1519167758481-83f550bb49b3', alt: 'Banquet hall set with round tables and gold chairs', tags: ['venue', 'banquet', 'event', 'wedding', 'corporate'] },
  { key: 'office-modern', id: '1497366216548-37526070297c', alt: 'Bright, empty modern office with glass partitions', tags: ['office', 'corporate', 'workspace'] },
  { key: 'team-collaboration', id: '1522071820081-009f0129c71c', alt: 'Team collaborating around laptops at a shared table', tags: ['team', 'corporate', 'collaboration', 'startup'] },
  { key: 'team-presentation', id: '1556761175-5973dc0f32e7', alt: 'Colleague presenting to a team in a loft office', tags: ['team', 'meeting', 'corporate', 'presentation'] },
  { key: 'developers', id: '1551434678-e076c223a692', alt: 'Two people working at monitors in a plant-filled office', tags: ['technology', 'saas', 'team', 'office'] },
  { key: 'skyscrapers', id: '1486406146926-c627a92ad1ab', alt: 'Looking up at glass skyscrapers against a blue sky', tags: ['corporate', 'finance', 'city', 'architecture'] },
  { key: 'villa-pool', id: '1600596542815-ffad4c1539a9', alt: 'White modern villa with a pool under a clear sky', tags: ['real estate', 'villa', 'architecture', 'pool'] },
  { key: 'house-garden', id: '1600585154340-be6161a56a0c', alt: 'Contemporary house with large windows and a lawn at dusk', tags: ['real estate', 'house', 'architecture'] },
  { key: 'terrace-dining', id: '1559339352-11d035aa65de', alt: 'Terrace restaurant with sea views and blue chairs', tags: ['restaurant', 'terrace', 'dining', 'view', 'hospitality'] },
  { key: 'tropical-pool', id: '1520250497591-112f2f40a3f4', alt: 'Tropical resort pool framed by palms and mountains', tags: ['resort', 'pool', 'tropical', 'hospitality'] },
  { key: 'deck-mountain-dusk', id: '1445019980597-93fa8acb246c', alt: 'Daybeds on a deck overlooking mountains at dusk', tags: ['resort', 'view', 'mountains', 'relaxation'] },
  { key: 'beach-sunset', id: '1507525428034-b723cf961d3e', alt: 'Gentle waves on a sandy beach at sunset', tags: ['beach', 'sea', 'sunset', 'travel'] },
  { key: 'lake-cabin', id: '1470770841072-f978cf4d019e', alt: 'Wooden cabin on a misty mountain lake', tags: ['lake', 'cabin', 'mountains', 'retreat', 'eco'] },
  { key: 'forest-path', id: '1441974231531-c6227db76b6e', alt: 'Sunlight falling through tall trees onto a forest path', tags: ['forest', 'nature', 'eco', 'walk'] },
  { key: 'desert-road', id: '1500530855697-b586d89ba3ee', alt: 'Road winding through red rock desert', tags: ['travel', 'road', 'adventure', 'landscape'] },
  { key: 'team-smiling', id: '1531545514256-b1400bc00f31', alt: 'Smiling colleagues gathered around a laptop', tags: ['team', 'people', 'education', 'startup'] },
  { key: 'open-office', id: '1504384308090-c894fdcc538d', alt: 'Large open-plan office with rows of desks', tags: ['office', 'corporate', 'workspace'] },
  { key: 'villa-white', id: '1512917774080-9991f1c4c750', alt: 'White villa with a pool and palm trees', tags: ['real estate', 'villa', 'luxury', 'pool'] },
  { key: 'creative-team', id: '1559599101-f09722fb4948', alt: 'Three creatives laughing in a bright studio', tags: ['agency', 'creative', 'team', 'people'] },
  { key: 'resort-palms-dusk', id: '1551882547-ff40c63fe5fa', alt: 'Resort pool lined with palms under a violet dusk sky', tags: ['resort', 'pool', 'luxury', 'evening'] },
  { key: 'infinity-deck-sea', id: '1584132967334-10e028bd69f7', alt: 'Wooden deck and infinity pool overlooking the sea', tags: ['resort', 'pool', 'sea', 'luxury', 'view'] },
  { key: 'bedroom-glass-view', id: '1578683010236-d716f9a3f461', alt: 'Minimal bedroom with floor-to-ceiling glass and a view', tags: ['room', 'suite', 'modern', 'accommodation'] },
  { key: 'city-skyline-dusk', id: '1583417319070-4a69db38a482', alt: 'City skyline reflected in a river at dusk', tags: ['city', 'corporate', 'skyline', 'travel'] },
  { key: 'bedroom-classic', id: '1505693416388-ac5ce068fe85', alt: 'Bright bedroom with an upholstered headboard and bench', tags: ['room', 'bedroom', 'accommodation', 'classic'] },
  { key: 'friends-dining', id: '1528605248644-14dd04022da1', alt: 'Friends sharing dinner and conversation at a long table', tags: ['restaurant', 'people', 'dining', 'celebration'] },
  { key: 'restaurant-bar', id: '1552566626-52f8b828add9', alt: 'Busy restaurant with an open bar and warm lighting', tags: ['restaurant', 'bar', 'interior'] },
  { key: 'steak-plate', id: '1600891964092-4316c288032e', alt: 'Sliced steak with fries on a white plate', tags: ['food', 'restaurant', 'grill'] },
  { key: 'wedding-reception', id: '1519225421980-715cb0215aed', alt: 'Long reception table dressed with linen, candles and flowers', tags: ['wedding', 'reception', 'event', 'venue'] },
  { key: 'wedding-couple-palms', id: '1606216794074-735e91aa2c92', alt: 'Newlyweds walking hand in hand beneath palms', tags: ['wedding', 'couple', 'celebration'] },
  { key: 'misty-hills', id: '1469474968028-56623f02e42e', alt: 'Green hills fading into morning mist', tags: ['nature', 'hills', 'landscape', 'eco'] },
  { key: 'forest-river', id: '1473448912268-2022ce9509d8', alt: 'Calm river winding through a pine forest', tags: ['nature', 'river', 'forest', 'eco'] },
  { key: 'office-celebration', id: '1600880292203-757bb62b4baf', alt: 'Colleagues high-fiving across a desk in a brick office', tags: ['team', 'corporate', 'success', 'people'] },
];

const BY_KEY = new Map(IMAGE_LIBRARY.map((i) => [i.key, i]));

export function libraryUrl(img: LibraryImage, width = 2400) {
  return `https://images.unsplash.com/photo-${img.id}?w=${width}&q=80&auto=format&fit=crop`;
}

/** Compact catalog for prompts. */
export function imageCatalogText(): string {
  return IMAGE_LIBRARY.map((i) => `- ${i.key}: ${i.alt} [${i.tags.join(', ')}]`).join('\n');
}

/** Replace `library:<key>` references anywhere in a value tree with real image refs. */
export function resolveLibraryImages<T>(value: T): T {
  const visit = (v: unknown): unknown => {
    if (typeof v === 'string' && v.startsWith('library:')) {
      const img = BY_KEY.get(v.slice(8).trim());
      return img ? libraryUrl(img) : libraryUrl(IMAGE_LIBRARY[0]!);
    }
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.src === 'string' && o.src.startsWith('library:')) {
        const img = BY_KEY.get(o.src.slice(8).trim()) ?? IMAGE_LIBRARY[0]!;
        return { ...Object.fromEntries(Object.entries(o).map(([k, x]) => [k, visit(x)])), src: libraryUrl(img), alt: typeof o.alt === 'string' && o.alt ? o.alt : img.alt };
      }
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, visit(x)]));
    }
    return v;
  };
  return visit(value) as T;
}
