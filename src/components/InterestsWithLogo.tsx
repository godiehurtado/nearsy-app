// src/components/InterestsWithLogo.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  ScrollView,
  TextInput,
} from 'react-native';

import {
  InterestLabel,
  LogoPick,
  InterestAffiliations,
} from '../types/profile';

type LogoOption = {
  id: string;
  name: string;
  emoji: string;
};

// Subcategorías para Sports
type SportsSubcategoryId =
  | 'team'
  | 'racquet'
  | 'combat'
  | 'racing'
  | 'water'
  | 'winter'
  | 'strength'
  | 'outdoor'
  | 'mind';

type SportsSubcategory = {
  id: SportsSubcategoryId;
  title: string;
  options: LogoOption[];
};

const SPORTS_GROUPS: SportsSubcategory[] = [
  {
    id: 'team',
    title: 'Team Sports',
    options: [
      { id: 'sport-soccer', name: 'Soccer', emoji: '⚽' },
      { id: 'sport-basketball', name: 'Basketball', emoji: '🏀' },
      { id: 'sport-volleyball', name: 'Volleyball', emoji: '🏐' },
      { id: 'sport-handball', name: 'Handball', emoji: '🥅' },
      { id: 'sport-rugby-union', name: 'Rugby Union', emoji: '🏉' },
      { id: 'sport-rugby-league', name: 'Rugby League', emoji: '🏉' },
      { id: 'sport-baseball', name: 'Baseball', emoji: '⚾' },
      { id: 'sport-softball', name: 'Softball', emoji: '🥎' },
      { id: 'sport-ice-hockey', name: 'Ice Hockey', emoji: '🏒' },
      { id: 'sport-field-hockey', name: 'Field Hockey', emoji: '🏑' },
      { id: 'sport-indoor-hockey', name: 'Indoor Hockey', emoji: '🏑' },
      { id: 'sport-water-polo', name: 'Water Polo', emoji: '🤾' },
      { id: 'sport-lacrosse', name: 'Lacrosse', emoji: '🥍' },
      { id: 'sport-beach-volleyball', name: 'Beach Volleyball', emoji: '🏐' },
      { id: 'sport-beach-handball', name: 'Beach Handball', emoji: '🤾' },
      {
        id: 'sport-wheelchair-basketball',
        name: 'Wheelchair Basketball',
        emoji: '🦽',
      },
      { id: 'sport-wheelchair-rugby', name: 'Wheelchair Rugby', emoji: '🦽' },
    ],
  },
  {
    id: 'racquet',
    title: 'Racquet & Net Sports',
    options: [
      { id: 'sport-tennis', name: 'Tennis', emoji: '🎾' },
      { id: 'sport-badminton', name: 'Badminton', emoji: '🏸' },
      { id: 'sport-table-tennis', name: 'Table Tennis', emoji: '🏓' },
      { id: 'sport-squash', name: 'Squash', emoji: '🎾' },
      { id: 'sport-padel', name: 'Padel', emoji: '🎾' },
      { id: 'sport-racquetball', name: 'Racquetball', emoji: '🎾' },
    ],
  },
  {
    id: 'combat',
    title: 'Combat Sports & Martial Arts',
    options: [
      { id: 'sport-karate', name: 'Karate', emoji: '🥋' },
      { id: 'sport-taekwondo', name: 'Taekwondo', emoji: '🥋' },
      { id: 'sport-judo', name: 'Judo', emoji: '🥋' },
      { id: 'sport-aikido', name: 'Aikido', emoji: '🥋' },
      { id: 'sport-kung-fu', name: 'Kung Fu', emoji: '🥋' },
      { id: 'sport-muay-thai', name: 'Muay Thai', emoji: '🥋' },
      { id: 'sport-bjj', name: 'Brazilian Jiu-Jitsu', emoji: '🥋' },
      { id: 'sport-sumo', name: 'Sumo', emoji: '🤼' },
      { id: 'sport-boxing', name: 'Boxing', emoji: '🥊' },
      { id: 'sport-mma', name: 'MMA', emoji: '🥊' },
      { id: 'sport-kickboxing', name: 'Kickboxing', emoji: '🥊' },
      { id: 'sport-wrestling', name: 'Wrestling', emoji: '🤼' },
      { id: 'sport-kendo', name: 'Kendo', emoji: '🤺' },
      { id: 'sport-hema', name: 'Historical Fencing (HEMA)', emoji: '🤺' },
      { id: 'sport-fencing', name: 'Fencing', emoji: '🤺' },
    ],
  },
  {
    id: 'racing',
    title: 'Racing & Motorsports',
    options: [
      { id: 'sport-formula1', name: 'Formula 1', emoji: '🏎️' },
      { id: 'sport-motogp', name: 'MotoGP', emoji: '🏍️' },
      { id: 'sport-motorcycling', name: 'Motorcycling', emoji: '🏍️' },
      { id: 'sport-offroad', name: 'Off-Road Racing', emoji: '🛻' },
      { id: 'sport-horse-racing', name: 'Horse Racing', emoji: '🏇' },
      { id: 'sport-cycling', name: 'Cycling', emoji: '🚴' },
      { id: 'sport-mountain-biking', name: 'Mountain Biking', emoji: '🚵' },
      { id: 'sport-rowing', name: 'Rowing', emoji: '🚣' },
      { id: 'sport-canoeing', name: 'Canoeing', emoji: '🛶' },
      { id: 'sport-kayak', name: 'Kayaking', emoji: '🛶' },
    ],
  },
  {
    id: 'water',
    title: 'Water & Board Sports',
    options: [
      { id: 'sport-swimming', name: 'Swimming', emoji: '🏊' },
      { id: 'sport-surfing', name: 'Surfing', emoji: '🌊' },
      { id: 'sport-bodyboard', name: 'Bodyboarding', emoji: '🏄' },
      { id: 'sport-diving', name: 'Diving', emoji: '🤿' },
      { id: 'sport-sailing', name: 'Sailing', emoji: '⛵' },
      { id: 'sport-windsurfing', name: 'Windsurfing', emoji: '⛵' },
      { id: 'sport-powerboating', name: 'Powerboating', emoji: '🚤' },
      { id: 'sport-underwater-hockey', name: 'Underwater Hockey', emoji: '🤿' },
      { id: 'sport-spearfishing', name: 'Spearfishing', emoji: '🤿' },
      { id: 'sport-water-polo2', name: 'Water Polo', emoji: '🤾' },
    ],
  },
  {
    id: 'winter',
    title: 'Winter Sports',
    options: [
      { id: 'sport-alpine-ski', name: 'Alpine Skiing', emoji: '🎿' },
      {
        id: 'sport-cross-country-ski',
        name: 'Cross-Country Skiing',
        emoji: '⛷️',
      },
      { id: 'sport-snowboarding', name: 'Snowboarding', emoji: '🏂' },
      { id: 'sport-ice-skating', name: 'Ice Skating', emoji: '⛸️' },
      { id: 'sport-figure-skating', name: 'Figure Skating', emoji: '⛸️' },
      { id: 'sport-bobsleigh', name: 'Bobsleigh', emoji: '🛷' },
      { id: 'sport-skeleton', name: 'Skeleton', emoji: '🛷' },
      { id: 'sport-luge', name: 'Luge', emoji: '🛷' },
      { id: 'sport-curling', name: 'Curling', emoji: '🥌' },
      { id: 'sport-biathlon', name: 'Biathlon', emoji: '🎿' },
      { id: 'sport-ice-climbing', name: 'Ice Climbing', emoji: '🧊' },
      { id: 'sport-toboggan', name: 'Toboggan', emoji: '🛷' },
    ],
  },
  {
    id: 'strength',
    title: 'Strength & Fitness',
    options: [
      { id: 'sport-weightlifting', name: 'Weightlifting', emoji: '🏋️' },
      { id: 'sport-powerlifting', name: 'Powerlifting', emoji: '🏋️' },
      { id: 'sport-crossfit', name: 'Cross Training', emoji: '🏋️' },
      { id: 'sport-gymnastics', name: 'Gymnastics', emoji: '🤸' },
      { id: 'sport-rhythmic', name: 'Rhythmic Gymnastics', emoji: '🤸' },
      { id: 'sport-trampoline', name: 'Trampoline', emoji: '🤸' },
      { id: 'sport-yoga-sport', name: 'Yoga Sport', emoji: '🧘' },
    ],
  },
  {
    id: 'outdoor',
    title: 'Outdoor & Adventure',
    options: [
      { id: 'sport-rock-climbing', name: 'Rock Climbing', emoji: '🧗' },
      { id: 'sport-sport-climbing', name: 'Sport Climbing', emoji: '🧗‍♀️' },
      { id: 'sport-parkour', name: 'Parkour', emoji: '🛝' },
      { id: 'sport-skydiving', name: 'Skydiving', emoji: '🪂' },
      { id: 'sport-paragliding', name: 'Paragliding', emoji: '🪂' },
      { id: 'sport-kiteboarding', name: 'Kiteboarding', emoji: '🪁' },
      { id: 'sport-outdoor-running', name: 'Cross Country', emoji: '🎽' },
      { id: 'sport-marathon', name: 'Marathon', emoji: '🏃' },
      { id: 'sport-ultra-running', name: 'Ultra Running', emoji: '🏃' },
    ],
  },
  {
    id: 'mind',
    title: 'Mind & Precision Sports',
    options: [
      { id: 'sport-darts', name: 'Darts', emoji: '🎯' },
      { id: 'sport-billiards', name: 'Billiards', emoji: '🎱' },
      { id: 'sport-snooker', name: 'Snooker', emoji: '🎱' },
      { id: 'sport-archery', name: 'Archery', emoji: '🏹' },
      { id: 'sport-shooting', name: 'Shooting', emoji: '🔫' },
      { id: 'sport-petanque', name: 'Petanque', emoji: '🧿' },
      { id: 'sport-bocce', name: 'Bocce', emoji: '🧿' },
      { id: 'sport-speedcubing', name: 'Speedcubing', emoji: '🧩' },
      { id: 'sport-esports', name: 'Esports', emoji: '🎮' },
      { id: 'sport-disc-golf', name: 'Disc Golf', emoji: '🥏' },
      { id: 'sport-ultimate-frisbee', name: 'Ultimate Frisbee', emoji: '🥏' },
      { id: 'sport-mini-golf', name: 'Mini Golf', emoji: '🏌️' },
      { id: 'sport-sport-fishing', name: 'Sport Fishing', emoji: '🎣' },
      { id: 'sport-polo', name: 'Polo', emoji: '🏇' },
    ],
  },
];

// Subcategorías para Music
type MusicSubcategoryId =
  | 'rock_metal'
  | 'pop_mainstream'
  | 'urban_hiphop'
  | 'latin'
  | 'electronic'
  | 'jazz_blues_soul'
  | 'classical'
  | 'world_traditional'
  | 'ambient_experimental'
  | 'soundtracks_media';

type MusicSubcategory = {
  id: MusicSubcategoryId;
  title: string;
  options: LogoOption[];
};

const MUSIC_GROUPS: MusicSubcategory[] = [
  {
    id: 'rock_metal',
    title: 'Rock & Metal',
    options: [
      { id: 'music-rock', name: 'Rock', emoji: '🎸' },
      { id: 'music-hard-rock', name: 'Hard Rock', emoji: '🤘' },
      { id: 'music-soft-rock', name: 'Soft Rock', emoji: '🎸' },
      { id: 'music-indie-rock', name: 'Indie Rock', emoji: '🎸' },
      { id: 'music-gothic-rock', name: 'Gothic Rock', emoji: '🌑' },
      { id: 'music-punk-rock', name: 'Punk Rock', emoji: '⚡' },
      { id: 'music-metal', name: 'Metal', emoji: '🤘' },
      { id: 'music-heavy-metal', name: 'Heavy Metal', emoji: '🤘' },
      { id: 'music-thrash-metal', name: 'Thrash Metal', emoji: '🤘' },
      { id: 'music-death-metal', name: 'Death Metal', emoji: '🤘' },
      { id: 'music-black-metal', name: 'Black Metal', emoji: '🤘' },
      { id: 'music-alternative', name: 'Alternative', emoji: '🎸' },
      { id: 'music-surf-rock', name: 'Surf Rock', emoji: '🎸' },
      { id: 'music-grunge', name: 'Grunge', emoji: '🎤' },
      { id: 'music-post-hardcore', name: 'Post-Hardcore', emoji: '🤘' },
      { id: 'music-opera-rock', name: 'Opera Rock', emoji: '🎤' },
    ],
  },
  {
    id: 'pop_mainstream',
    title: 'Pop & Mainstream',
    options: [
      { id: 'music-pop', name: 'Pop', emoji: '🎶' },
      { id: 'music-kpop', name: 'K-Pop', emoji: '💅' },
      { id: 'music-jpop', name: 'J-Pop', emoji: '🎶' },
      { id: 'music-cpop', name: 'C-Pop', emoji: '🎶' },
      { id: 'music-indie-pop', name: 'Indie Pop', emoji: '🎶' },
      { id: 'music-synthpop', name: 'Synthpop', emoji: '🎶' },
      { id: 'music-motown', name: 'Motown', emoji: '🎶' },
      { id: 'music-doowop', name: 'Doo-Wop', emoji: '🎤' },
    ],
  },
  {
    id: 'urban_hiphop',
    title: 'Hip-Hop, Rap & Urban',
    options: [
      { id: 'music-hiphop', name: 'Hip-Hop', emoji: '🎤' },
      { id: 'music-rap', name: 'Rap', emoji: '🎤' },
      { id: 'music-rnb', name: 'R&B', emoji: '🎙️' },
      { id: 'music-trap', name: 'Trap', emoji: '🎧' },
      { id: 'music-emo-rap', name: 'Emo Rap', emoji: '🎤' },
      { id: 'music-horrorcore', name: 'Horrorcore', emoji: '😈' },
      { id: 'music-latin-trap', name: 'Latin Trap', emoji: '🔥' },
    ],
  },
  {
    id: 'latin',
    title: 'Latin & Regional',
    options: [
      { id: 'music-latin-pop', name: 'Latin Pop', emoji: '💃' },
      { id: 'music-reggaeton', name: 'Reggaeton', emoji: '🎺' },
      { id: 'music-salsa', name: 'Salsa', emoji: '🎺' },
      { id: 'music-merengue', name: 'Merengue', emoji: '🪘' },
      { id: 'music-bachata', name: 'Bachata', emoji: '💃' },
      {
        id: 'music-regional-mexicano',
        name: 'Regional Mexicano',
        emoji: '🎶',
      },
      { id: 'music-mariachi', name: 'Mariachi', emoji: '🎻' },
      { id: 'music-norteno', name: 'Norteño', emoji: '🪗' },
      { id: 'music-banda', name: 'Banda', emoji: '🎺' },
      { id: 'music-corridos', name: 'Corridos', emoji: '🎤' },
      { id: 'music-flamenco', name: 'Flamenco', emoji: '🔥' },
      { id: 'music-tango', name: 'Tango', emoji: '💃' },
      { id: 'music-samba', name: 'Samba', emoji: '🥁' },
      { id: 'music-bossa', name: 'Bossa Nova', emoji: '🎶' },
      { id: 'music-mpb', name: 'MPB (Brazil)', emoji: '🎶' },
      { id: 'music-kizomba', name: 'Kizomba', emoji: '🎶' },
      { id: 'music-zouk', name: 'Zouk', emoji: '💃' },
    ],
  },
  {
    id: 'electronic',
    title: 'Electronic & EDM',
    options: [
      { id: 'music-edm', name: 'EDM', emoji: '🎧' },
      { id: 'music-house', name: 'House', emoji: '🎧' },
      { id: 'music-techno', name: 'Techno', emoji: '🔊' },
      { id: 'music-trance', name: 'Trance', emoji: '🔊' },
      { id: 'music-deep-house', name: 'Deep House', emoji: '🎧' },
      {
        id: 'music-progressive-house',
        name: 'Progressive House',
        emoji: '🎧',
      },
      { id: 'music-electro', name: 'Electro', emoji: '🎧' },
      { id: 'music-dubstep', name: 'Dubstep', emoji: '🎧' },
      { id: 'music-dnb', name: 'Drum & Bass', emoji: '🎧' },
      { id: 'music-minimal-techno', name: 'Minimal Techno', emoji: '🎧' },
      { id: 'music-chillwave', name: 'Chillwave', emoji: '🎧' },
      { id: 'music-vaporwave', name: 'Vaporwave', emoji: '🎧' },
      { id: 'music-lofi', name: 'Lo-Fi', emoji: '🎧' },
    ],
  },
  {
    id: 'jazz_blues_soul',
    title: 'Jazz, Blues & Soul',
    options: [
      { id: 'music-jazz', name: 'Jazz', emoji: '🎷' },
      { id: 'music-afrojazz', name: 'Afro-Jazz', emoji: '🥁' },
      { id: 'music-smooth-jazz', name: 'Smooth Jazz', emoji: '🎷' },
      { id: 'music-swing', name: 'Swing', emoji: '🎷' },
      { id: 'music-blues', name: 'Blues', emoji: '🎸' },
      { id: 'music-soul', name: 'Soul', emoji: '🎤' },
      { id: 'music-neo-soul', name: 'Neo-Soul', emoji: '🎤' },
      { id: 'music-funk', name: 'Funk', emoji: '🎶' },
      { id: 'music-disco', name: 'Disco', emoji: '🎹' },
      { id: 'music-ska', name: 'Ska', emoji: '🥁' },
    ],
  },
  {
    id: 'classical',
    title: 'Classical & Instrumental',
    options: [
      { id: 'music-classical', name: 'Classical', emoji: '🎼' },
      { id: 'music-baroque', name: 'Baroque', emoji: '🎻' },
      { id: 'music-romantic', name: 'Romantic Era', emoji: '🎼' },
      { id: 'music-opera', name: 'Opera', emoji: '🎹' },
      { id: 'music-chamber', name: 'Chamber Music', emoji: '🎹' },
      { id: 'music-symphonic', name: 'Symphonic', emoji: '🎹' },
      { id: 'music-gospel', name: 'Gospel', emoji: '🎶' },
      {
        id: 'music-christian-contemporary',
        name: 'Christian Contemporary',
        emoji: '🎶',
      },
      { id: 'music-worship', name: 'Worship', emoji: '🎶' },
      { id: 'music-new-age', name: 'New Age', emoji: '🎵' },
    ],
  },
  {
    id: 'world_traditional',
    title: 'World & Traditional',
    options: [
      { id: 'music-reggae', name: 'Reggae', emoji: '🪘' },
      { id: 'music-dancehall', name: 'Dancehall', emoji: '🪘' },
      { id: 'music-island', name: 'Island Music', emoji: '🌴' },
      { id: 'music-afrobeat', name: 'Afrobeat', emoji: '🎶' },
      { id: 'music-afropop', name: 'Afropop', emoji: '🪘' },
      { id: 'music-amapiano', name: 'Amapiano', emoji: '🎤' },
      { id: 'music-highlife', name: 'Highlife', emoji: '🥁' },
      { id: 'music-soukous', name: 'Soukous', emoji: '🥁' },
      { id: 'music-celtic', name: 'Celtic', emoji: '🎻' },
      { id: 'music-irish-folk', name: 'Irish Folk', emoji: '🎻' },
      { id: 'music-bollywood', name: 'Bollywood', emoji: '🥁' },
      { id: 'music-bhangra', name: 'Bhangra', emoji: '🥁' },
      {
        id: 'music-indian-classical',
        name: 'Indian Classical',
        emoji: '🥁',
      },
      { id: 'music-c-traditional', name: 'C-Traditional', emoji: '🥢' },
      { id: 'music-j-traditional', name: 'J-Traditional', emoji: '🥢' },
      { id: 'music-middle-eastern', name: 'Middle Eastern', emoji: '🥁' },
      { id: 'music-arabic-pop', name: 'Arabic Pop', emoji: '🥁' },
      {
        id: 'music-persian-traditional',
        name: 'Persian Traditional',
        emoji: '🥁',
      },
      { id: 'music-tribal', name: 'Tribal', emoji: '🥁' },
      { id: 'music-world', name: 'World Music', emoji: '🥁' },
    ],
  },
  {
    id: 'ambient_experimental',
    title: 'Ambient & Experimental',
    options: [
      { id: 'music-ambient', name: 'Ambient', emoji: '🌌' },
      { id: 'music-soundtrack-chill', name: 'Chillwave', emoji: '🎧' },
      { id: 'music-vaporwave2', name: 'Vaporwave', emoji: '🎧' },
      { id: 'music-lofi2', name: 'Lo-Fi', emoji: '🎧' },
      { id: 'music-experimental', name: 'Experimental', emoji: '🎛️' },
      { id: 'music-avantgarde', name: 'Avant-Garde', emoji: '🎛️' },
    ],
  },
  {
    id: 'soundtracks_media',
    title: 'Soundtracks & Media',
    options: [
      { id: 'music-soundtrack', name: 'Soundtrack', emoji: '🎼' },
      { id: 'music-film-score', name: 'Film Score', emoji: '🎬' },
      {
        id: 'music-videogame',
        name: 'Video Game Music',
        emoji: '🎮',
      },
      { id: 'music-spoken-word', name: 'Spoken Word', emoji: '🎤' },
    ],
  },
];

// Subcategorías para Healthy Lifestyle
type HealthySubcategoryId =
  | 'nutrition'
  | 'fitness'
  | 'mental'
  | 'holistic'
  | 'lifestyle';

type HealthySubcategory = {
  id: HealthySubcategoryId;
  title: string;
  options: LogoOption[];
};

const HEALTHY_GROUPS: HealthySubcategory[] = [
  {
    id: 'nutrition',
    title: 'Nutrition & Eating Habits',
    options: [
      { id: 'hl-clean-eating', name: 'Clean Eating', emoji: '🥗' },
      { id: 'hl-whole-foods', name: 'Whole Foods Lifestyle', emoji: '🌾' },
      { id: 'hl-plant-based', name: 'Plant-Based', emoji: '🥑' },
      { id: 'hl-vegan', name: 'Vegan', emoji: '🥦' },
      { id: 'hl-high-protein', name: 'High-Protein', emoji: '🍗' },
      { id: 'hl-mediterranean', name: 'Mediterranean', emoji: '🐟' },
      { id: 'hl-balanced-diet', name: 'Balanced Diet', emoji: '🍚' },
      { id: 'hl-vegetarian', name: 'Vegetarian', emoji: '🌱' },
      { id: 'hl-portion-control', name: 'Portion Control', emoji: '⚖️' },
      { id: 'hl-anti-inflammatory', name: 'Anti-Inflammatory', emoji: '🍵' },
    ],
  },
  {
    id: 'mental',
    title: 'Mental & Emotional Wellness',
    options: [
      { id: 'hl-mindfulness', name: 'Mindfulness', emoji: '🧘' },
      { id: 'hl-meditation', name: 'Meditation', emoji: '🧘‍♂️' },
      { id: 'hl-gratitude', name: 'Gratitude Practice', emoji: '🙏' },
      { id: 'hl-journaling', name: 'Journaling', emoji: '📓' },
      { id: 'hl-stress-management', name: 'Stress Management', emoji: '😌' },
      { id: 'hl-sleep-health', name: 'Sleep Health', emoji: '💤' },
      { id: 'hl-work-life', name: 'Work–Life Balance', emoji: '⚖️' },
      { id: 'hl-creative-wellness', name: 'Creative Wellness', emoji: '🎨' },
      { id: 'hl-cognitive-health', name: 'Cognitive Health', emoji: '🧠' },
      { id: 'hl-relationships', name: 'Healthy Relationships', emoji: '🤝' },
    ],
  },
  {
    id: 'holistic',
    title: 'Holistic & Self-Care',
    options: [
      { id: 'hl-holistic-living', name: 'Holistic Living', emoji: '🌿' },
      { id: 'hl-self-care', name: 'Self-Care Rituals', emoji: '🕯️' },
      { id: 'hl-aromatherapy', name: 'Aromatherapy', emoji: '🌸' },
      { id: 'hl-rest-recovery', name: 'Rest & Recovery', emoji: '🛁' },
      {
        id: 'hl-sun-nature',
        name: 'Sunlight & Nature Therapy',
        emoji: '🌞',
      },
      { id: 'hl-bodywork', name: 'Bodywork', emoji: '💆‍♀️' },
      { id: 'hl-breathwork', name: 'Breathwork', emoji: '🌬️' },
      {
        id: 'hl-skin-body',
        name: 'Skin & Body Wellness',
        emoji: '🧴',
      },
      { id: 'hl-preventive', name: 'Preventive Health', emoji: '⚕️' },
      { id: 'hl-grounding', name: 'Grounding / Earthing', emoji: '👣' },
    ],
  },
  {
    id: 'lifestyle',
    title: 'Lifestyle Choices & Daily Habits',
    options: [
      { id: 'hl-hydration', name: 'Hydration Lifestyle', emoji: '🚰' },
      { id: 'hl-minimalism', name: 'Minimalism', emoji: '🧹' },
      { id: 'hl-clean-home', name: 'Clean Home Lifestyle', emoji: '🏡' },
      { id: 'hl-sustainable', name: 'Sustainable Living', emoji: '♻️' },
      {
        id: 'hl-routine-organization',
        name: 'Routine & Organization',
        emoji: '🧺',
      },
      {
        id: 'hl-clean-habits',
        name: 'Clean Personal Habits',
        emoji: '🧼',
      },
      { id: 'hl-slow-living', name: 'Slow Living', emoji: '🧘' },
      { id: 'hl-time-management', name: 'Time Management', emoji: '🕰️' },
      { id: 'hl-low-stress', name: 'Low-Stress Lifestyle', emoji: '🍃' },
      { id: 'hl-financial', name: 'Financial Wellness', emoji: '💵' },
    ],
  },
];

// Subcategorías para Extra-Curricular Activities (mapeadas al label "Interests")
type ExtraSubcategoryId =
  | 'creative'
  | 'sports'
  | 'games'
  | 'outdoor'
  | 'skills';

type ExtraSubcategory = {
  id: ExtraSubcategoryId;
  title: string;
  options: LogoOption[];
};

const EXTRA_GROUPS: ExtraSubcategory[] = [
  {
    id: 'creative',
    title: 'Creative & Artistic',
    options: [
      { id: 'ec-painting', name: 'Painting', emoji: '🎨' },
      { id: 'ec-drawing', name: 'Drawing', emoji: '✏️' },
      { id: 'ec-drama', name: 'Drama Club', emoji: '🎭' },
      { id: 'ec-film-club', name: 'Film Club', emoji: '🎬' },
      { id: 'ec-singing', name: 'Singing', emoji: '🎤' },
      { id: 'ec-music-band', name: 'Music Band', emoji: '🎶' },
      { id: 'ec-dance', name: 'Dance', emoji: '🕺' },
      { id: 'ec-photography', name: 'Photography', emoji: '📸' },
      { id: 'ec-dj', name: 'DJ Club', emoji: '🎧' },
      { id: 'ec-creative-writing', name: 'Creative Writing', emoji: '✍️' },
    ],
  },
  {
    id: 'games',
    title: 'Games & Social Clubs',
    options: [
      { id: 'ec-chess', name: 'Chess Club', emoji: '🔮' },
      { id: 'ec-board-games', name: 'Board Games', emoji: '🎲' },
      { id: 'ec-gaming-club', name: 'Gaming Club', emoji: '🎮' },
      { id: 'ec-card-games', name: 'Card Games', emoji: '🃏' },
      { id: 'ec-darts', name: 'Darts', emoji: '🎯' },
      { id: 'ec-puzzle', name: 'Puzzle Club', emoji: '🧩' },
      { id: 'ec-social-dance', name: 'Social Dance Club', emoji: '💃' },
      { id: 'ec-karaoke', name: 'Karaoke Nights', emoji: '🎤' },
      { id: 'ec-event-planning', name: 'Event Planning Club', emoji: '🥳' },
      { id: 'ec-anime', name: 'Anime Club', emoji: '🧸' },
    ],
  },
  {
    id: 'outdoor',
    title: 'Outdoor & Adventure',
    options: [
      { id: 'ec-hiking', name: 'Hiking', emoji: '🥾' },
      { id: 'ec-rock-climbing', name: 'Rock Climbing', emoji: '🧗' },
      { id: 'ec-kayaking', name: 'Kayaking', emoji: '🚣' },
      { id: 'ec-camping', name: 'Camping', emoji: '🏕️' },
      { id: 'ec-nature-club', name: 'Nature Club', emoji: '🌳' },
      { id: 'ec-orienteering', name: 'Orienteering', emoji: '🧭' },
      { id: 'ec-canoeing', name: 'Canoeing', emoji: '🛶' },
      { id: 'ec-horseback', name: 'Horseback Riding', emoji: '🐎' },
      { id: 'ec-boating', name: 'Boating', emoji: '🚤' },
      { id: 'ec-sunrise-walks', name: 'Sunrise Walks', emoji: '🌅' },
    ],
  },
  {
    id: 'skills',
    title: 'Skill-Building & Hobbies',
    options: [
      { id: 'ec-coding', name: 'Coding Club', emoji: '💻' },
      { id: 'ec-strategy-games', name: 'Strategy Games', emoji: '♟️' },
      { id: 'ec-book-club', name: 'Book Club', emoji: '📚' },
      { id: 'ec-crafting', name: 'Crafting', emoji: '🧵' },
      { id: 'ec-knitting', name: 'Knitting / Crochet', emoji: '🧶' },
      { id: 'ec-cooking', name: 'Cooking Club', emoji: '🍳' },
      {
        id: 'ec-international-foods',
        name: 'International Foods Club',
        emoji: '🥘',
      },
      { id: 'ec-podcasting', name: 'Podcasting', emoji: '🎙️' },
      {
        id: 'ec-entrepreneurship',
        name: 'Entrepreneurship Club',
        emoji: '💼',
      },
      { id: 'ec-content-creation', name: 'Content Creation', emoji: '📱' },
    ],
  },
];

// Subcategorías para Others: Religión & Política
type OtherSubcategoryId = 'zodiac' | 'religion' | 'politics';

type OtherSubcategory = {
  id: OtherSubcategoryId;
  title: string;
  options: LogoOption[];
};

const OTHER_GROUPS: OtherSubcategory[] = [
  {
    id: 'zodiac',
    title: 'Zodiac Signs',
    options: [
      { id: 'zod-aries', name: 'Aries', emoji: '♈' },
      { id: 'zod-taurus', name: 'Taurus', emoji: '♉' },
      { id: 'zod-gemini', name: 'Gemini', emoji: '♊' },
      { id: 'zod-cancer', name: 'Cancer', emoji: '♋' },
      { id: 'zod-leo', name: 'Leo', emoji: '♌' },
      { id: 'zod-virgo', name: 'Virgo', emoji: '♍' },
      { id: 'zod-libra', name: 'Libra', emoji: '♎' },
      { id: 'zod-scorpio', name: 'Scorpio', emoji: '♏' },
      { id: 'zod-sagittarius', name: 'Sagittarius', emoji: '♐' },
      { id: 'zod-capricorn', name: 'Capricorn', emoji: '♑' },
      { id: 'zod-aquarius', name: 'Aquarius', emoji: '♒' },
      { id: 'zod-pisces', name: 'Pisces', emoji: '♓' },
    ],
  },
  {
    id: 'religion',
    title: 'Religion & Spirituality',
    options: [
      { id: 'rel-christianity', name: 'Christianity', emoji: '✝️' },
      { id: 'rel-islam', name: 'Islam', emoji: '☪️' },
      { id: 'rel-judaism', name: 'Judaism', emoji: '✡️' },
      { id: 'rel-hinduism', name: 'Hinduism', emoji: '🕉️' },
      { id: 'rel-buddhism', name: 'Buddhism', emoji: '☸️' },
      { id: 'rel-sikhism', name: 'Sikhism', emoji: '🪯' },
      { id: 'rel-bahai', name: "Bahá'í Faith", emoji: '🕎' },
      { id: 'rel-jainism', name: 'Jainism', emoji: '🕉️' },
      { id: 'rel-shinto', name: 'Shinto', emoji: '🏯' },
      { id: 'rel-taoism', name: 'Taoism', emoji: '☯️' },
      { id: 'rel-confucianism', name: 'Confucianism', emoji: '☯️' },
      { id: 'rel-zoroastrianism', name: 'Zoroastrianism', emoji: '🔥' },
      { id: 'rel-paganism', name: 'Paganism (Nature-based)', emoji: '🌿' },
      { id: 'rel-wicca', name: 'Wicca (Nature-based)', emoji: '🌙' },
      { id: 'rel-neopagan', name: 'Neopaganism', emoji: '🪄' },
      { id: 'rel-druidry', name: 'Druidry', emoji: '🌿' },
      { id: 'rel-asatru', name: 'Asatru (Norse)', emoji: '⚔️' },
      {
        id: 'rel-african-tradition',
        name: 'African Traditional Religions',
        emoji: '🌍',
      },
      {
        id: 'rel-native-american',
        name: 'Native American Traditions',
        emoji: '🪶',
      },
      {
        id: 'rel-aboriginal',
        name: 'Aboriginal Spirituality',
        emoji: '🌄',
      },
      { id: 'rel-spiritualism', name: 'Spiritualism', emoji: '🕊️' },
      { id: 'rel-new-age', name: 'New Age', emoji: '✨' },
      { id: 'rel-animism', name: 'Animism', emoji: '🌿' },
      { id: 'rel-shamanism', name: 'Shamanism', emoji: '🔮' },
      { id: 'rel-rastafari', name: 'Rastafarianism', emoji: '🌈' },
      // Corrientes filosófico-no religiosas / cosmovisiones
      { id: 'rel-humanism', name: 'Humanism', emoji: '⚛️' },
      { id: 'rel-agnostic', name: 'Agnosticism', emoji: '❓' },
      { id: 'rel-atheism', name: 'Atheism', emoji: '🚫' },
    ],
  },
  {
    id: 'politics',
    title: 'Politics & Civic Orientation',
    options: [
      { id: 'pol-liberal', name: 'Liberal Parties', emoji: '🔵' },
      { id: 'pol-conservative', name: 'Conservative Parties', emoji: '🔴' },
      { id: 'pol-socialist', name: 'Socialist Parties', emoji: '🌹' },
      {
        id: 'pol-social-democratic',
        name: 'Social Democratic Parties',
        emoji: '⚖️',
      },
      {
        id: 'pol-green',
        name: 'Green / Environmental Parties',
        emoji: '🟢',
      },
      {
        id: 'pol-centrist',
        name: 'Centrist / Moderate Parties',
        emoji: '🟡',
      },
      { id: 'pol-nationalist', name: 'Nationalist Parties', emoji: '🧭' },
      {
        id: 'pol-christian-democratic',
        name: 'Christian Democratic Parties',
        emoji: '🏛️',
      },
      {
        id: 'pol-labor',
        name: "Labor / Workers' Parties",
        emoji: '🛠️',
      },
      { id: 'pol-technocratic', name: 'Technocratic Parties', emoji: '🧪' },
      {
        id: 'pol-lib-con',
        name: 'Liberal-Conservative (Mixed) Parties',
        emoji: '📘',
      },
      {
        id: 'pol-globalist',
        name: 'Globalist / Internationalist Parties',
        emoji: '🌍',
      },
      {
        id: 'pol-peace',
        name: 'Peace / Pacifist Parties',
        emoji: '🕊️',
      },
      {
        id: 'pol-civil-rights',
        name: 'Civil Rights / Equality Parties',
        emoji: '🎗️',
      },
      {
        id: 'pol-agrarian',
        name: 'Agrarian / Rural Parties',
        emoji: '🌾',
      },
      {
        id: 'pol-populist',
        name: 'Populist Parties (Neutral)',
        emoji: '🗣️',
      },
      {
        id: 'pol-progressive',
        name: 'Progressive Reform Parties',
        emoji: '🟣',
      },
      {
        id: 'pol-regional',
        name: 'Regional / Independence Parties',
        emoji: '🏳️',
      },
      {
        id: 'pol-education',
        name: 'Education & Youth-Focused Parties',
        emoji: '📚',
      },
      {
        id: 'pol-law-order',
        name: 'Law & Order / Security Parties',
        emoji: '🧑‍⚖️',
      },
    ],
  },
];

// Subcategorías para Language (top 10 languages)
type LanguageSubcategoryId = 'top_languages';

type LanguageSubcategory = {
  id: LanguageSubcategoryId;
  title: string;
  options: LogoOption[];
};

const LANGUAGE_GROUPS: LanguageSubcategory[] = [
  {
    id: 'top_languages',
    title: 'Top Languages',
    options: [
      { id: 'lang-english', name: 'English', emoji: '🇺🇸' }, // puedes cambiar a 🇬🇧 si prefieres
      { id: 'lang-spanish', name: 'Spanish', emoji: '🇪🇸' },
      { id: 'lang-chinese', name: 'Chinese (Mandarin)', emoji: '🇨🇳' },
      { id: 'lang-hindi', name: 'Hindi', emoji: '🇮🇳' },
      { id: 'lang-arabic', name: 'Arabic', emoji: '🇸🇦' },
      { id: 'lang-french', name: 'French', emoji: '🇫🇷' },
      { id: 'lang-german', name: 'German', emoji: '🇩🇪' },
      { id: 'lang-portuguese', name: 'Portuguese', emoji: '🇵🇹' }, // o 🇧🇷 si quieres foco Brasil
      { id: 'lang-russian', name: 'Russian', emoji: '🇷🇺' },
      { id: 'lang-japanese', name: 'Japanese', emoji: '🇯🇵' },
    ],
  },
];

// Catálogo por interés (por ahora solo Sports lleno)
const logoCatalog: Record<InterestLabel, LogoOption[]> = {
  Sports: SPORTS_GROUPS.flatMap((g) => g.options),
  Music: MUSIC_GROUPS.flatMap((g) => g.options),
  'Healthy Lifestyle': HEALTHY_GROUPS.flatMap((g) => g.options),
  'Extra-Curricular Activities': EXTRA_GROUPS.flatMap((g) => g.options),
  Language: LANGUAGE_GROUPS.flatMap((g) => g.options),
  Other: OTHER_GROUPS.flatMap((g) => g.options),
};

// ──────────────────────────────────────────────────────────────────────────────
// Componente
export default function InterestsWithLogo({
  value,
  onChange,
  scope = 'personal',
  editable = true,
}: {
  value: InterestAffiliations;
  onChange: (next: InterestAffiliations) => void;
  scope?: 'personal' | 'professional';
  editable?: boolean;
}) {
  const [interestLogoMap, setInterestLogoMap] = useState<InterestAffiliations>(
    value ?? {},
  );

  const interestOptions = useMemo(() => {
    if (scope === 'professional') {
      return [
        { label: 'Healthy Lifestyle', icon: '🧘' },
        { label: 'Extra-Curricular Activities', icon: '🎭' },
        { label: 'Language', icon: '🔤' },
        { label: 'Other', icon: '🌐' },
        { label: 'Sports', icon: '🏀' },
        { label: 'Music', icon: '🎵' },
      ] as const;
    }
    return [
      { label: 'Healthy Lifestyle', icon: '🧘' },
      { label: 'Extra-Curricular Activities', icon: '🎭' },
      { label: 'Language', icon: '🔤' },
      { label: 'Other', icon: '🌐' },
      { label: 'Sports', icon: '🏀' },
      { label: 'Music', icon: '🎵' },
    ] as const;
  }, [scope]);

  useEffect(() => setInterestLogoMap(value ?? {}), [value]);

  const [modalVisible, setModalVisible] = useState(false);
  const [currentInterest, setCurrentInterest] = useState<InterestLabel | null>(
    null,
  );
  const [searchText, setSearchText] = useState('');

  const selectedInterests = useMemo(
    () => Object.keys(interestLogoMap) as InterestLabel[],
    [interestLogoMap],
  );

  const openInterestModal = (interest: InterestLabel) => {
    setCurrentInterest(interest);
    setSearchText('');
    setModalVisible(true);
  };

  const onPressInterest = (interest: InterestLabel) => {
    if (!editable) return;
    openInterestModal(interest);
  };

  const toggleLogo = (logo: LogoOption) => {
    if (!currentInterest) return;
    const curr = interestLogoMap[currentInterest] ?? [];
    const exists = curr.some((p) => p.id === logo.id);

    const nextPicks: LogoPick[] = exists
      ? curr.filter((p) => p.id !== logo.id)
      : [...curr, { id: logo.id, name: logo.name, emoji: logo.emoji }];

    const next = { ...interestLogoMap, [currentInterest]: nextPicks };
    setInterestLogoMap(next);
    onChange(next);
  };

  const removeLogo = (interest: InterestLabel, logoId: string) => {
    const curr = interestLogoMap[interest] ?? [];
    const nextPicks = curr.filter((p) => p.id !== logoId);
    const next = { ...interestLogoMap, [interest]: nextPicks };
    setInterestLogoMap(next);
    onChange(next);
  };

  const iconFor = useMemo(
    () =>
      Object.fromEntries(
        interestOptions.map((it) => [it.label, it.icon]),
      ) as Record<InterestLabel, string>,
    [interestOptions],
  );

  const dataForCurrent: LogoOption[] = currentInterest
    ? logoCatalog[currentInterest] ?? []
    : [];

  const normalizedSearch = searchText.trim().toLowerCase();

  const filterOptions = (options: LogoOption[]) =>
    !normalizedSearch
      ? options
      : options.filter((o) => o.name.toLowerCase().includes(normalizedSearch));

  const groups =
    currentInterest === 'Sports'
      ? SPORTS_GROUPS
      : currentInterest === 'Music'
      ? MUSIC_GROUPS
      : currentInterest === 'Healthy Lifestyle'
      ? HEALTHY_GROUPS
      : currentInterest === 'Extra-Curricular Activities'
      ? EXTRA_GROUPS
      : currentInterest === 'Language'
      ? LANGUAGE_GROUPS
      : currentInterest === 'Other'
      ? OTHER_GROUPS
      : null;

  return (
    <View style={styles.container}>
      {/* Selector de intereses */}
      <View style={styles.interestsContainer}>
        <Text style={styles.modeLabel}>Select Your Interests:</Text>
        <View style={styles.interestsList}>
          {interestOptions.map((it) => {
            const isSelected = !!interestLogoMap[it.label];
            return (
              <TouchableOpacity
                key={it.label}
                style={[
                  styles.interestButton,
                  isSelected && styles.interestSelected,
                ]}
                onPress={() => onPressInterest(it.label)}
                disabled={!editable}
              >
                <Text style={styles.interestText}>
                  {it.icon} {it.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Modal de logos */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setModalVisible(false);
          setCurrentInterest(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {currentInterest
                ? `Choose a ${currentInterest} icon`
                : 'Choose an icon'}
            </Text>

            {/* Buscador */}
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name..."
              placeholderTextColor="#9CA3AF"
              value={searchText}
              onChangeText={setSearchText}
            />

            {/* Grid de catálogo */}

            {groups ? (
              <ScrollView
                style={{ maxHeight: '70%' }}
                contentContainerStyle={{ paddingVertical: 6 }}
              >
                {groups.map((group) => {
                  const filtered = filterOptions(group.options);
                  if (filtered.length === 0) return null;

                  return (
                    <View key={group.id} style={styles.groupBlock}>
                      <Text style={styles.groupTitle}>{group.title}</Text>
                      <View style={styles.groupRow}>
                        {filtered.map((item) => {
                          const selected = !!interestLogoMap[
                            currentInterest!
                          ]?.some((p) => p.id === item.id);
                          return (
                            <TouchableOpacity
                              key={item.id}
                              style={[
                                styles.logoItem,
                                selected && styles.logoItemSelected,
                              ]}
                              onPress={() => toggleLogo(item)}
                            >
                              <View style={styles.emojiCircle}>
                                <Text style={styles.logoEmoji}>
                                  {item.emoji}
                                </Text>
                              </View>
                              <Text style={styles.logoLabel} numberOfLines={1}>
                                {item.name}
                              </Text>
                              {selected && (
                                <View style={styles.checkDot}>
                                  <Text style={{ color: '#fff', fontSize: 11 }}>
                                    ✓
                                  </Text>
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ) : dataForCurrent.length > 0 ? (
              <FlatList
                data={filterOptions(dataForCurrent)}
                keyExtractor={(item) => item.id}
                numColumns={3}
                columnWrapperStyle={styles.logoRow}
                contentContainerStyle={styles.logoGrid}
                renderItem={({ item }) => {
                  const selected = !!interestLogoMap[currentInterest!]?.some(
                    (p) => p.id === item.id,
                  );
                  return (
                    <TouchableOpacity
                      style={[
                        styles.logoItem,
                        selected && styles.logoItemSelected,
                      ]}
                      onPress={() => toggleLogo(item)}
                    >
                      <View style={styles.emojiCircle}>
                        <Text style={styles.logoEmoji}>{item.emoji}</Text>
                      </View>
                      <Text style={styles.logoLabel} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {selected && (
                        <View style={styles.checkDot}>
                          <Text style={{ color: '#fff', fontSize: 11 }}>✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            ) : (
              <Text style={styles.emptyText}>
                No icons configured yet for this interest.
              </Text>
            )}

            {/* Acciones modal */}
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => {
                setModalVisible(false);
                setCurrentInterest(null);
              }}
            >
              <Text style={styles.modalCloseText}>Done</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => {
                setModalVisible(false);
                setCurrentInterest(null);
              }}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Selecciones */}
      <View style={styles.selectedContainer}>
        <Text style={styles.selectedTitle}>Your interests by category</Text>

        {selectedInterests.length === 0 ? (
          <Text style={styles.emptyText}>
            Pick an interest and choose an icon.
          </Text>
        ) : (
          <View>
            {Object.entries(interestLogoMap).map(([label, picks]) => {
              const typedLabel = label as InterestLabel;
              const list = picks || [];
              if (list.length === 0) return null;

              return (
                <View key={label} style={styles.selectedCategoryBlock}>
                  {/* Título de categoría: icono + nombre (Sports, Music, etc.) */}
                  <Text style={styles.selectedCategoryTitle}>
                    {(iconFor[typedLabel] ?? '') + ' ' + label}
                  </Text>

                  {/* Grid de íconos dentro de esa categoría */}
                  <View style={styles.selectedGrid}>
                    {list.map((pick) => (
                      <View
                        key={`${label}-${pick.id}`}
                        style={styles.selectedItem}
                      >
                        <View style={styles.selectedIconWrapper}>
                          <View style={styles.emojiCircle}>
                            <Text style={styles.logoEmoji}>
                              {pick.emoji || '⭐'}
                            </Text>
                          </View>
                        </View>

                        {editable && (
                          <TouchableOpacity
                            onPress={() => removeLogo(typedLabel, pick.id)}
                            style={styles.removeBtn}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={styles.removeTxt}>✕</Text>
                          </TouchableOpacity>
                        )}

                        <Text numberOfLines={1} style={styles.selectedCaption}>
                          {pick.name}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16, padding: 16, flex: 1 },

  // Intereses
  interestsContainer: { gap: 8 },
  modeLabel: { fontSize: 16, fontWeight: '600' },
  interestsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  interestButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  interestSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  interestText: { fontSize: 14 },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },

  searchInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: '#F9FAFB',
  },

  // Sports groups
  groupBlock: {
    marginBottom: 12,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 6,
  },
  groupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },

  logoGrid: { paddingVertical: 6 },
  logoRow: { justifyContent: 'space-between', marginBottom: 10 },

  logoItem: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    position: 'relative',
    marginBottom: 8,
  },

  logoItemSelected: {
    borderColor: '#111827',
  },

  emojiCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#4B5563', // gris oscuro
    backgroundColor: '#F3F4F6', // gris claro
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },

  logoEmoji: {
    fontSize: 30,
  },

  logoLabel: {
    fontSize: 11,
    textAlign: 'center',
    maxWidth: '100%',
  },

  checkDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Selecciones (abajo)
  selectedContainer: { gap: 8, marginTop: 12 },
  selectedTitle: { fontSize: 16, fontWeight: '600' },

  selectedGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  selectedItem: {
    width: '25%',
    alignItems: 'center',
    marginBottom: 14,
    position: 'relative',
  },
  selectedIconWrapper: {
    marginBottom: 4,
  },

  removeBtn: {
    position: 'absolute',
    top: -4,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeTxt: { color: '#fff', fontSize: 12 },

  selectedCaption: {
    marginTop: 6,
    fontSize: 11,
    color: '#374151',
    textAlign: 'center',
  },

  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 10,
  },

  modalCloseBtn: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: '100%',
    margin: 5,
    borderRadius: 12,
    backgroundColor: '#3B5A85',
  },
  modalCloseText: { fontSize: 16, color: '#FFFFFF', textAlign: 'center' },

  selectedCategoryBlock: {
    marginBottom: 16,
  },

  selectedCategoryTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
    color: '#111827',
  },
});
