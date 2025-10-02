// InterestsWithLogo.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Image,
  FlatList,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker'; // ⬅️ nuevo
import { getAuth } from 'firebase/auth'; // ⬅️ para uid
import { uploadInterestLogo } from '../services/storageService'; // ⬅️ nuevo

import {
  InterestLabel,
  LogoPick,
  InterestAffiliations,
} from '../types/profile';
import { IMAGES } from '../constants/images';

type LogoOption = {
  id: string;
  name: string;
  imageKey: keyof typeof IMAGES;
};

const interestOptions: { label: InterestLabel; icon: string }[] = [
  { label: 'Sports', icon: '🏀' },
  { label: 'Travel', icon: '✈️' },
  { label: 'Music', icon: '🎵' },
  { label: 'Study', icon: '🎓' },
  { label: 'Gaming', icon: '🎮' },
  { label: 'Country', icon: '🗺️' },
  { label: 'Healthy Lifestyle', icon: '🧘' },
  { label: 'Fun Time', icon: '🕺' },
  { label: 'Pets', icon: '🐕' },
  { label: 'Other', icon: '✨' },
];

// 3) Catálogo por interés → usa imageKey
const logoCatalog: Record<InterestLabel, LogoOption[]> = {
  Sports: [
    { id: 'spo-athletics', name: 'Athletics', imageKey: 'athletics' },
    { id: 'spo-baseball', name: 'Baseball', imageKey: 'baseball' },
    { id: 'spo-basketball', name: 'Basketball', imageKey: 'basketball' },
    { id: 'spo-bowling', name: 'Bowling', imageKey: 'bowling' },
    { id: 'spo-celtics', name: 'Celtics (NBA)', imageKey: 'celtics' },
    {
      id: 'spo-chicago_bulls',
      name: 'Chicago Bulls (NBA)',
      imageKey: 'chicago_bulls',
    },
    { id: 'spo-cowboys', name: 'Cowboys (NFL)', imageKey: 'cowboys' },
    { id: 'spo-cycling', name: 'Cycling', imageKey: 'cycling' },
    { id: 'spo-duke_blue', name: 'Duke Blue (NCAA)', imageKey: 'duke_blue' },
    { id: 'spo-football', name: 'Football', imageKey: 'football' },
    { id: 'spo-golf', name: 'Golf', imageKey: 'golf' },
    { id: 'spo-green_bay', name: 'Green Bay (NFL)', imageKey: 'green_bay' },
    { id: 'spo-hockey', name: 'Hockey', imageKey: 'hockey' },
    {
      id: 'spo-inter_miami',
      name: 'Inter Miami (MLS)',
      imageKey: 'inter_miami',
    },
    {
      id: 'spo-kentucky_wildcats',
      name: 'Kentucky Wildcats (NCAA)',
      imageKey: 'kentucky_wildcats',
    },
    { id: 'spo-la_galaxy', name: 'LA Galaxy (MLS)', imageKey: 'la_galaxy' },
    { id: 'spo-lakers', name: 'Lakers (NBA)', imageKey: 'lakers' },
    { id: 'spo-miami_heat', name: 'Miami Heat (NBA)', imageKey: 'miami_heat' },
    {
      id: 'spo-new_england_patriots',
      name: 'New England Patriots (NFL)',
      imageKey: 'new_england_patriots',
    },
    {
      id: 'spo-new_yorck_city',
      name: 'New York City (MLS)',
      imageKey: 'new_yorck_city',
    },
    {
      id: 'spo-north_carolina_tar_heels',
      name: 'North Carolina Tar Heels (NCAA)',
      imageKey: 'north_carolina_tar_heels',
    },
    { id: 'spo-pinpong', name: 'Pinpong', imageKey: 'pinpong' },
    {
      id: 'spo-san_francisco',
      name: 'San Francisco (NFL)',
      imageKey: 'san_francisco',
    },
    { id: 'spo-skiing', name: 'Skiing', imageKey: 'skiing' },
    { id: 'spo-soccer', name: 'Soccer', imageKey: 'soccer' },
    { id: 'spo-swimming', name: 'Swimming', imageKey: 'swimming' },
    { id: 'spo-volleyball', name: 'Volleyball', imageKey: 'volleyball' },
    { id: 'spo-warriors', name: 'Warriors (NBA)', imageKey: 'warriors' },
    { id: 'spo-weights', name: 'Weights', imageKey: 'weights' },
  ],
  Travel: [
    { id: 'trv-beach', name: 'Beach', imageKey: 'beach' },
    { id: 'trv-big_ben_london', name: 'London', imageKey: 'big_ben_london' },
    { id: 'trv-egypt', name: 'Egypt', imageKey: 'egypt' },
    { id: 'trv-japan', name: 'Japan', imageKey: 'japan1' },
    { id: 'trv-lake', name: 'Lake', imageKey: 'lake' },
    { id: 'trv-moscow', name: 'Moscow', imageKey: 'moscow' },
    { id: 'trv-mountain', name: 'Mountain', imageKey: 'mountain' },
    { id: 'trv-park', name: 'Park', imageKey: 'park' },
    { id: 'trv-pizza_tower', name: 'Paris', imageKey: 'paris' },
    { id: 'trv-paris', name: 'Pizza', imageKey: 'pizza_tower' },
    { id: 'trv-roman_colosseum', name: 'Roman', imageKey: 'roman_colosseum' },
    { id: 'trv-sidney', name: 'Sidney', imageKey: 'sidney' },
    {
      id: 'trv-statue_of_liberty',
      name: 'New York',
      imageKey: 'statue_of_liberty',
    },
    { id: 'trv-stonehenge', name: 'Stonehenge', imageKey: 'stonehenge' },
    { id: 'trv-tag_mahal', name: 'Tag Mahal', imageKey: 'tag_mahal' },
    {
      id: 'trv-triumphal_arch',
      name: 'Triumphal Arch',
      imageKey: 'triumphal_arch',
    },
  ],
  Music: [
    { id: 'ms-ac_dc', name: 'AC DC', imageKey: 'ac_dc' },
    { id: 'ms-aero_smith', name: 'Aero Smith', imageKey: 'aero_smith' },
    { id: 'ms-classic', name: 'Classic', imageKey: 'classic' },
    { id: 'ms-electronic', name: 'Electronic', imageKey: 'electronic' },
    { id: 'ms-jazz', name: 'Jazz', imageKey: 'jazz' },
    { id: 'ms-kiss', name: 'Kiss', imageKey: 'kiss' },
    { id: 'ms-latin', name: 'Latin', imageKey: 'latin' },
    { id: 'ms-metal', name: 'Metal', imageKey: 'metal' },
    { id: 'ms-metallica', name: 'Metallica', imageKey: 'metallica' },
    { id: 'ms-nirvana', name: 'Nirvana', imageKey: 'nirvana' },
    { id: 'ms-pop', name: 'Pop', imageKey: 'pop' },
    { id: 'ms-queen', name: 'Queen', imageKey: 'queen' },
    { id: 'ms-rock', name: 'Rock', imageKey: 'rock' },
    {
      id: 'ms-rollin_stone',
      name: 'The Rolling Stones',
      imageKey: 'rollin_stone',
    },
    { id: 'ms-salsa', name: 'Salsa', imageKey: 'salsa' },
    { id: 'ms-the_beatles', name: 'The Beatles', imageKey: 'the_beatles' },
  ],
  Study: [],
  Gaming: [
    { id: 'g-nintendo', name: 'Nintendo', imageKey: 'nintendo' },
    {
      id: 'g-nintendo_switch',
      name: 'Nintendo Switch',
      imageKey: 'nintendo_switch',
    },
    { id: 'g-pc_games', name: 'PC Games', imageKey: 'pc_games' },
    { id: 'g-play_station', name: 'Play Station', imageKey: 'play_station' },
    { id: 'g-sega', name: 'Sega', imageKey: 'sega' },
    { id: 'g-xbox', name: 'Xbox', imageKey: 'xbox' },
  ],
  Country: [
    { id: 'c-albania', name: 'Albania', imageKey: 'albania' },
    { id: 'c-andorra', name: 'Andorra', imageKey: 'andorra' },
    {
      id: 'c-antigua-barbuda',
      name: 'Antigua and Barbuda',
      imageKey: 'antigua_barbuda',
    },
    { id: 'c-argentina', name: 'Argentina', imageKey: 'argentina' },
    { id: 'c-armenia', name: 'Armenia', imageKey: 'armenia' },
    { id: 'c-austria', name: 'Austria', imageKey: 'austria' },
    { id: 'c-azerbaijan', name: 'Azerbaijan', imageKey: 'azerbaijan' },
    { id: 'c-bahamas', name: 'Bahamas', imageKey: 'bahamas' },
    { id: 'c-barbados', name: 'Barbados', imageKey: 'barbados' },
    { id: 'c-belarus', name: 'Belarus', imageKey: 'belarus' },
    { id: 'c-belgium', name: 'Belgium', imageKey: 'belgium' },
    { id: 'c-belize', name: 'Belize', imageKey: 'belize' },
    { id: 'c-bolivia', name: 'Bolivia', imageKey: 'bolivia' },
    { id: 'c-bosnia', name: 'Bosnia and Herzegovina', imageKey: 'bosnia' },
    { id: 'c-brazil', name: 'Brazil', imageKey: 'brazil' },
    { id: 'c-bulgaria', name: 'Bulgaria', imageKey: 'bulgaria' },
    { id: 'c-canada', name: 'Canada', imageKey: 'canada' },
    { id: 'c-chile', name: 'Chile', imageKey: 'chile' },
    { id: 'c-china', name: 'China', imageKey: 'china' },
    { id: 'c-colombia', name: 'Colombia', imageKey: 'colombia' },
    { id: 'c-costa-rica', name: 'Costa Rica', imageKey: 'costa_rica' },
    { id: 'c-croatia', name: 'Croatia', imageKey: 'croatia' },
    { id: 'c-cuba', name: 'Cuba', imageKey: 'cuba' },
    { id: 'c-cyprus', name: 'Cyprus', imageKey: 'cyprus' },
    {
      id: 'c-czech-republic',
      name: 'Czech Republic',
      imageKey: 'czech_republic',
    },
    { id: 'c-denmark', name: 'Denmark', imageKey: 'denmark' },
    { id: 'c-dominica', name: 'Dominica', imageKey: 'dominica' },
    {
      id: 'c-dominican-republic',
      name: 'Dominican Republic',
      imageKey: 'dominican_republic',
    },
    { id: 'c-ecuador', name: 'Ecuador', imageKey: 'ecuador' },
    { id: 'c-el-salvador', name: 'El Salvador', imageKey: 'el_salvador' },
    { id: 'c-estonia', name: 'Estonia', imageKey: 'estonia' },
    { id: 'c-finland', name: 'Finland', imageKey: 'finland' },
    { id: 'c-france', name: 'France', imageKey: 'france' },
    { id: 'c-georgia', name: 'Georgia', imageKey: 'georgia' },
    { id: 'c-germany', name: 'Germany', imageKey: 'germany' },
    { id: 'c-grenada', name: 'Grenada', imageKey: 'grenada' },
    { id: 'c-greece', name: 'Greece', imageKey: 'greece' },
    { id: 'c-guatemala', name: 'Guatemala', imageKey: 'guatemala' },
    { id: 'c-guyana', name: 'Guyana', imageKey: 'guyana' },
    { id: 'c-haiti', name: 'Haiti', imageKey: 'haiti' },
    { id: 'c-honduras', name: 'Honduras', imageKey: 'honduras' },
    { id: 'c-hungary', name: 'Hungary', imageKey: 'hungary' },
    { id: 'c-iceland', name: 'Iceland', imageKey: 'iceland' },
    { id: 'c-ireland', name: 'Ireland', imageKey: 'ireland' },
    { id: 'c-italy', name: 'Italy', imageKey: 'italy' },
    { id: 'c-jamaica', name: 'Jamaica', imageKey: 'jamaica' },
    { id: 'c-japan', name: 'Japan', imageKey: 'japan' },
    { id: 'c-kazakhstan', name: 'Kazakhstan', imageKey: 'kazakhstan' },
    { id: 'c-latvia', name: 'Latvia', imageKey: 'latvia' },
    { id: 'c-liechtenstein', name: 'Liechtenstein', imageKey: 'liechtenstein' },
    { id: 'c-lithuania', name: 'Lithuania', imageKey: 'lithuania' },
    { id: 'c-luxembourg', name: 'Luxembourg', imageKey: 'luxembourg' },
    { id: 'c-macedonia', name: 'North Macedonia', imageKey: 'macedonia' },
    { id: 'c-malta', name: 'Malta', imageKey: 'malta' },
    { id: 'c-mexico', name: 'Mexico', imageKey: 'mexico' },
    { id: 'c-moldova', name: 'Moldova', imageKey: 'moldova' },
    { id: 'c-monaco', name: 'Monaco', imageKey: 'monaco' },
    { id: 'c-montenegro', name: 'Montenegro', imageKey: 'montenegro' },
    { id: 'c-netherlands', name: 'Netherlands', imageKey: 'netherlands' },
    { id: 'c-nicaragua', name: 'Nicaragua', imageKey: 'nicaragua' },
    { id: 'c-norway', name: 'Norway', imageKey: 'norway' },
    { id: 'c-panama', name: 'Panama', imageKey: 'panama' },
    { id: 'c-paraguay', name: 'Paraguay', imageKey: 'paraguay' },
    { id: 'c-peru', name: 'Peru', imageKey: 'peru' },
    { id: 'c-poland', name: 'Poland', imageKey: 'poland' },
    { id: 'c-portugal', name: 'Portugal', imageKey: 'portugal' },
    { id: 'c-romania', name: 'Romania', imageKey: 'romania' },
    {
      id: 'c-saint-kitts-nevis',
      name: 'Saint Kitts and Nevis',
      imageKey: 'saint_kitts_nevis',
    },
    { id: 'c-saint-lucia', name: 'Saint Lucia', imageKey: 'saint_lucia' },
    {
      id: 'c-saint-vincent',
      name: 'Saint Vincent and the Grenadines',
      imageKey: 'saint_vincent',
    },
    { id: 'c-san-marino', name: 'San Marino', imageKey: 'san_marino' },
    { id: 'c-serbia', name: 'Serbia', imageKey: 'serbia' },
    { id: 'c-slovakia', name: 'Slovakia', imageKey: 'slovakia' },
    { id: 'c-slovenia', name: 'Slovenia', imageKey: 'slovenia' },
    { id: 'c-spain', name: 'Spain', imageKey: 'spain' },
    { id: 'c-suriname', name: 'Suriname', imageKey: 'suriname' },
    { id: 'c-sweden', name: 'Sweden', imageKey: 'sweden' },
    { id: 'c-switzerland', name: 'Switzerland', imageKey: 'switzerland' },
    {
      id: 'c-trinidad-tobago',
      name: 'Trinidad and Tobago',
      imageKey: 'trinidad_tobago',
    },
    { id: 'c-turkey', name: 'Turkey', imageKey: 'turkey' },
    { id: 'c-ukraine', name: 'Ukraine', imageKey: 'ukraine' },
    {
      id: 'c-united-kingdom',
      name: 'United Kingdom',
      imageKey: 'united_kingdom',
    },
    { id: 'c-uruguay', name: 'Uruguay', imageKey: 'uruguay' },
    { id: 'c-usa', name: 'United States', imageKey: 'usa' },
    { id: 'c-vatican', name: 'Vatican City', imageKey: 'vatican' },
    { id: 'c-venezuela', name: 'Venezuela', imageKey: 'venezuela' },
  ],
  'Healthy Lifestyle': [
    { id: 'hl-family_time', name: 'Family Time', imageKey: 'family_time' },
    { id: 'hl-healthy_food', name: 'Healthy Food', imageKey: 'healthy_food' },
    { id: 'hl-healthy_life', name: 'Healthy Time', imageKey: 'healthy_life' },
    { id: 'hl-medicine', name: 'Medicine', imageKey: 'medicine' },
    {
      id: 'hl-mental_health',
      name: 'Mental Health',
      imageKey: 'mental_health',
    },
    { id: 'hl-nature', name: 'Nature', imageKey: 'nature' },
    { id: 'hl-no_excesses', name: 'No Excesses', imageKey: 'no_excesses' },
    { id: 'hl-no_smoke', name: 'No Smoke', imageKey: 'no_smoke' },
    { id: 'hl-ride_bike', name: 'Cyclist', imageKey: 'ride_bike' },
    { id: 'hl-run', name: 'Runner', imageKey: 'run' },
    { id: 'hl-sleep', name: 'Sleep', imageKey: 'sleep' },
    { id: 'hl-sun', name: 'Sunbathe', imageKey: 'sun' },
    { id: 'hl-vegetables', name: 'Vegetables', imageKey: 'vegetables' },
    { id: 'hl-water', name: 'Water', imageKey: 'water' },
    { id: 'hl-workout', name: 'Work out', imageKey: 'workout' },
    { id: 'hl-yoga', name: 'Yoga', imageKey: 'yoga' },
  ],
  'Fun Time': [
    { id: 'f-dance', name: 'Dance', imageKey: 'dance' },
    { id: 'f-bar', name: 'Bar', imageKey: 'bar' },
    { id: 'f-library', name: 'Library', imageKey: 'library' },
    { id: 'f-casino', name: 'Casino', imageKey: 'casino' },
    { id: 'f-shopping-mall', name: 'Shopping Mall', imageKey: 'shopping_mall' },
    { id: 'f-movies', name: 'Movies', imageKey: 'movies' },
    { id: 'f-circus', name: 'Circus', imageKey: 'circus' },
    { id: 'f-concert', name: 'Concert', imageKey: 'concert' },
    { id: 'f-stadium', name: 'Stadium', imageKey: 'stadium' },
    { id: 'f-art-gallery', name: 'Art Gallery', imageKey: 'art_gallery' },
    { id: 'f-gastronomy', name: 'Gastronomy', imageKey: 'gastronomy' },
    { id: 'f-church', name: 'Church', imageKey: 'church' },
    { id: 'f-museum', name: 'Museum', imageKey: 'museum' },
    {
      id: 'f-amusement-park',
      name: 'Amusement Park',
      imageKey: 'amusement_park',
    },
    { id: 'f-theater', name: 'Theater', imageKey: 'theater' },
    { id: 'f-zoo', name: 'Zoo', imageKey: 'zoo' },
  ],
  Pets: [
    { id: 'pt-cat', name: 'Cat', imageKey: 'cat' },
    { id: 'pt-chamaleon', name: 'Chamaleon', imageKey: 'chameleon' },
    { id: 'pt-chicken', name: 'Chicken', imageKey: 'chicken' },
    { id: 'pt-dog', name: 'Dog', imageKey: 'dog' },
    { id: 'pt-duck', name: 'Duck', imageKey: 'duck' },
    { id: 'pt-fish', name: 'Fish', imageKey: 'fish' },
    { id: 'pt-guinea_pig', name: 'Guinea Pig', imageKey: 'guinea_pig' },
    { id: 'pt-hamster', name: 'Hamster', imageKey: 'hamster' },
    { id: 'pt-horse', name: 'Horse', imageKey: 'horse' },
    { id: 'pt-parrot', name: 'Parrot', imageKey: 'parrot' },
    { id: 'pt-pig', name: 'Pig', imageKey: 'pig' },
    { id: 'pt-rabbit', name: 'Rabbit', imageKey: 'rabbit' },
    { id: 'pt-turtle', name: 'Turtle', imageKey: 'turtle' },
  ],
  Career: [
    { id: 'c-lawyer', name: 'Lawyer', imageKey: 'lawyer' },
    { id: 'c-builder', name: 'Builder', imageKey: 'builder' },
    { id: 'c-artist', name: 'Artist', imageKey: 'artist' },
    { id: 'c-chef', name: 'Chef', imageKey: 'chef' },
    { id: 'c-doctor', name: 'Doctor', imageKey: 'doctor' },
    { id: 'c-plumber', name: 'Plumber', imageKey: 'plumber' },
    { id: 'c-farmer', name: 'Farmer', imageKey: 'farmer' },
    { id: 'c-engineer', name: 'Engineer', imageKey: 'engineer' },
    { id: 'c-marketer', name: 'Marketer', imageKey: 'marketer' },
    { id: 'c-mechanic', name: 'Mechanic', imageKey: 'mechanic' },
    { id: 'c-waiter', name: 'Waiter', imageKey: 'waiter' },
    { id: 'c-soldier', name: 'Soldier', imageKey: 'soldier' },
    { id: 'c-pilot', name: 'Pilot', imageKey: 'pilot' },
    { id: 'c-painter', name: 'Painter', imageKey: 'painter' },
    { id: 'c-police', name: 'Police', imageKey: 'police' },
    { id: 'c-teacher', name: 'Teacher', imageKey: 'teacher' },
  ],
  Lenguage: [
    { id: 'l-spanish', name: 'Spanish', imageKey: 'spain' },
    {
      id: 'l-english',
      name: 'English',
      imageKey: 'united_kingdom',
    },
    { id: 'l-portuguese', name: 'Portuguese', imageKey: 'portugal' },
    { id: 'l-german', name: 'German', imageKey: 'germany' },
    { id: 'l-italian', name: 'Italian', imageKey: 'italy' },
    { id: 'l-french', name: 'French', imageKey: 'france' },
  ],
  Interests: [
    { id: 'i-art', name: 'Art', imageKey: 'art' },
    { id: 'i-camping', name: 'Camping', imageKey: 'camping' },
    { id: 'i-cinema', name: 'Cinema', imageKey: 'cinema' },
    { id: 'i-dance', name: 'Dance', imageKey: 'dance1' },
    { id: 'i-games', name: 'Games', imageKey: 'games' },
    { id: 'i-gastronomy', name: 'Gastronomy', imageKey: 'gastronomy1' },
    { id: 'i-music', name: 'Music', imageKey: 'music' },
    { id: 'i-photography', name: 'Photography', imageKey: 'photography' },
    { id: 'i-reading', name: 'Reading', imageKey: 'reading' },
    { id: 'i-shopping', name: 'Shopping', imageKey: 'shopping' },
    { id: 'i-sports', name: 'Sports', imageKey: 'sports' },
    { id: 'i-television', name: 'Television', imageKey: 'television' },
    { id: 'i-travel', name: 'Travel', imageKey: 'travel' },
    { id: 'i-video-games', name: 'Video Games', imageKey: 'video_games' },
  ],

  Other: [
    { id: 'o-well-being', name: 'Well Being', imageKey: 'well_being' },
    { id: 'o-human-rights', name: 'Human Rights', imageKey: 'human_rights' },
    { id: 'o-diversity', name: 'Diversity', imageKey: 'diversity' },
    { id: 'o-ecology', name: 'Ecology', imageKey: 'ecology' },
    { id: 'o-economy', name: 'Economy', imageKey: 'economy' },
    { id: 'o-education', name: 'Education', imageKey: 'education' },
    { id: 'o-spirituality', name: 'Spirituality', imageKey: 'spirituality' },
    { id: 'o-feminism', name: 'Feminism', imageKey: 'feminism' },
    { id: 'o-philosophy', name: 'Philosophy', imageKey: 'philosophy' },
    { id: 'o-globalization', name: 'Globalization', imageKey: 'globalization' },
    {
      id: 'o-social-inclusion',
      name: 'Social Inclusion',
      imageKey: 'social_inclusion',
    },
    {
      id: 'o-artificial-intelligence',
      name: 'Artificial Intelligence',
      imageKey: 'artificial_intelligence',
    },
    { id: 'o-lgbtq-plus', name: 'LGBTQ+', imageKey: 'lgbtq' },
    { id: 'o-peace', name: 'Peace', imageKey: 'peace' },
    { id: 'o-politics', name: 'Politics', imageKey: 'politics' },
    { id: 'o-technology', name: 'Technology', imageKey: 'technology' },
  ],
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
        { label: 'Travel', icon: '✈️' },
        { label: 'Study', icon: '🎓' },
        { label: 'Country', icon: '🗺️' },
        { label: 'Career', icon: '💼' },
        { label: 'Lenguage', icon: '🔤' },
        { label: 'Interests', icon: '🎭' },
        { label: 'Other', icon: '🌐' },
      ] as const;
    }
    return [
      { label: 'Sports', icon: '🏀' },
      { label: 'Travel', icon: '✈️' },
      { label: 'Music', icon: '🎵' },
      { label: 'Study', icon: '🎓' },
      { label: 'Gaming', icon: '🎮' },
      { label: 'Country', icon: '🗺️' },
      { label: 'Healthy Lifestyle', icon: '🧘' },
      { label: 'Fun Time', icon: '🕺' },
      { label: 'Pets', icon: '🐕' },
      { label: 'Other', icon: '✨' },
    ] as const;
  }, [scope]);

  useEffect(() => setInterestLogoMap(value ?? {}), [value]);

  const [modalVisible, setModalVisible] = useState(false);
  const [currentInterest, setCurrentInterest] = useState<InterestLabel | null>(
    null,
  );

  const selectedInterests = useMemo(
    () => Object.keys(interestLogoMap) as InterestLabel[],
    [interestLogoMap],
  );

  const openInterestModal = (interest: InterestLabel) => {
    setCurrentInterest(interest);
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

    const nextPicks = exists
      ? curr.filter((p) => p.id !== logo.id)
      : [...curr, { id: logo.id, name: logo.name, imageKey: logo.imageKey }];

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

  // Data del modal + tile "custom"
  const dataForCurrent: LogoOption[] = currentInterest
    ? logoCatalog[currentInterest] ?? []
    : [];

  // ────────────────────────────────────────────────────────────────────────────
  // Agregar imagen personalizada
  const pickCustomImage = async () => {
    if (!currentInterest) return;
    const uid = getAuth().currentUser?.uid;
    if (!uid) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1], // cuadrado para círculos perfectos
      quality: 0.9,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0];
    const { url, path } = await uploadInterestLogo(
      uid,
      scope,
      currentInterest,
      asset.uri,
    );

    // Creamos un pick "custom"
    const customPick: LogoPick = {
      id: `custom_${Date.now()}`,
      name: 'Custom',
      imageUrl: url,
      path,
    };

    const curr = interestLogoMap[currentInterest] ?? [];
    const next = {
      ...interestLogoMap,
      [currentInterest]: [...curr, customPick],
    };
    setInterestLogoMap(next);
    onChange(next);
  };

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
                ? `Choose a ${currentInterest} logo`
                : 'Choose a logo'}
            </Text>

            {/* Grid de catálogo */}
            {dataForCurrent.length > 0 ? (
              <FlatList
                data={dataForCurrent}
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
                      <Image
                        source={IMAGES[item.imageKey]}
                        style={styles.logoImage}
                        resizeMode="contain"
                      />
                      <Text style={styles.logoLabel} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {selected && (
                        <View style={styles.checkDot}>
                          <Text style={{ color: '#fff' }}>✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                }}
                ListFooterComponent={
                  editable ? (
                    <TouchableOpacity
                      style={[styles.logoItem, styles.addItem]}
                      onPress={pickCustomImage}
                      activeOpacity={0.9}
                    >
                      <View style={styles.addCircle}>
                        <Text style={styles.addPlus}>＋</Text>
                      </View>
                      <Text style={styles.logoLabel} numberOfLines={1}>
                        Add your icon
                      </Text>
                    </TouchableOpacity>
                  ) : null
                }
              />
            ) : (
              <>
                <Text style={styles.emptyText}>
                  No logos configured yet for this interest.
                </Text>
                {editable && (
                  <TouchableOpacity
                    style={[styles.logoItem, styles.addItem]}
                    onPress={pickCustomImage}
                    activeOpacity={0.9}
                  >
                    <View style={styles.addCircle}>
                      <Text style={styles.addPlus}>＋</Text>
                    </View>
                    <Text style={styles.logoLabel} numberOfLines={1}>
                      Add your icon
                    </Text>
                  </TouchableOpacity>
                )}
              </>
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
        <Text style={styles.selectedTitle}>Your selected affiliations</Text>

        {selectedInterests.length === 0 ? (
          <Text style={styles.emptyText}>
            Pick an interest and choose a logo.
          </Text>
        ) : (
          <View style={styles.selectedGrid}>
            {Object.entries(interestLogoMap).map(([label, picks]) =>
              (picks || []).map((pick) => {
                const src = pick.imageKey
                  ? IMAGES[pick.imageKey as keyof typeof IMAGES]
                  : { uri: pick.imageUrl! };

                return (
                  <View key={`${label}-${pick.id}`} style={styles.selectedItem}>
                    <Image source={src} style={styles.selectedImg} />
                    {editable && (
                      <TouchableOpacity
                        onPress={() =>
                          removeLogo(label as InterestLabel, pick.id)
                        }
                        style={styles.removeBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.removeTxt}>✕</Text>
                      </TouchableOpacity>
                    )}
                    <Text numberOfLines={1} style={styles.selectedCaption}>
                      {(iconFor[label as InterestLabel] ?? '') +
                        ' ' +
                        pick.name}
                    </Text>
                  </View>
                );
              }),
            )}
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
  pillHint: { fontSize: 12, color: '#4F46E5' },

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
    maxHeight: '75%',
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },

  logoGrid: { paddingVertical: 6 },
  logoRow: { justifyContent: 'space-between', marginBottom: 10 },
  logoItem: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
    position: 'relative',
  },
  logoItemSelected: { borderColor: '#111827' },
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

  selectedGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  selectedItem: {
    width: '25%',
    alignItems: 'center',
    marginBottom: 14,
    position: 'relative',
  },
  selectedImg: { width: 45, height: 45, borderRadius: 10 },
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

  logoImage: {
    width: 56, // 👈 más pequeño
    height: 56,
    borderRadius: 10,
    marginBottom: 6,
  },

  logoLabel: {
    fontSize: 11, // 👈 más pequeño
    textAlign: 'center',
    maxWidth: '100%',
  },

  modalCloseBtn: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: '100%',
    margin: 5,
    borderRadius: 12,
    backgroundColor: '#3A5985',
    textAlign: 'center',
    color: '#FFFFFF',
  },
  modalCloseText: { fontSize: 16, color: '#FFFFFF', textAlign: 'center' },

  // Selecciones (abajo)
  selectedContainer: { gap: 8, marginTop: 12 },
  selectedTitle: { fontSize: 16, fontWeight: '600' },

  badgesRow: { gap: 12, paddingVertical: 4 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center', // centra horizontal si queda espacio
    gap: 5,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 5,
    borderRadius: 16,
    backgroundColor: '#fff',
    height: 100, // altura fija para centrar vertical
    minWidth: 120,
    position: 'relative', // para ubicar el "✕" absoluto
  },
  badgeImage: {
    width: 96,
    height: 64,
    alignSelf: 'center',
  },
  badgeRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRemoveText: { fontSize: 16, lineHeight: 16 },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 10,
  },

  // tile "Add your icon"
  addItem: {
    borderStyle: 'dashed',
  },
  addCircle: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  addPlus: { fontSize: 28, color: '#6B7280', lineHeight: 28 },
});
