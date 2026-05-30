import type { AddressFixture } from './types'

/**
 * Корпус адресов: реальные форматы из проекта + типовые варианты написания из реестра/ЕГРЮЛ.
 * При изменении парсера все кейсы должны проходить.
 */
export const ADDRESS_FIXTURES: AddressFixture[] = [
  // --- Реальные клиенты (prod) ---
  {
    id: 'aroma-moscow-vnukovo',
    input:
      'Россия, Москва Город, вн. тер. г. муниципальный округ Внуково, кв-л 63, д. 1А, стр. 9, административно-складское здание № 2',
    shortTitle: 'Москва, Внуково',
    city: 'Москва',
    location: 'Внуково',
    locationKind: 'district',
  },
  {
    id: 'aroma-spb-gorskoe',
    input:
      'Россия, Санкт-Петербург Город, внутригородское муниципальное образование города федерального значения Санкт-Петербурга поселок Парголово, территория Осиновая роща, Горское шоссе, дом 6, литера М',
    shortTitle: 'Санкт-Петербург, Горское шоссе',
    city: 'Санкт-Петербург',
    location: 'Горское шоссе',
    locationKind: 'street',
  },
  {
    id: 'ryatiko-solnechnogorsk-house',
    input: 'Россия, Московская Область, г.о. Солнечногорск, д. 5',
    shortTitle: 'Солнечногорск, д. 5',
    city: 'Солнечногорск',
    location: 'д. 5',
    locationKind: 'house',
  },

  // --- Seed / UI placeholders ---
  {
    id: 'seed-moscow-skladskaya',
    input: 'г. Москва, ул. Складская, д. 5',
    shortTitle: 'Москва, Складская',
    city: 'Москва',
    location: 'Складская',
    locationKind: 'street',
  },
  {
    id: 'audit-index-moscow-testovaya',
    input: '125009, г. Москва, ул. Тестовая, д. 1',
    shortTitle: 'Москва, Тестовая',
    city: 'Москва',
    location: 'Тестовая',
    locationKind: 'street',
  },

  // --- Аналоги: федеральные города ---
  {
    id: 'federal-moscow-gorod',
    input: '643, Москва Город, ул. Профсоюзная, д. 56',
    shortTitle: 'Москва, Профсоюзная',
    city: 'Москва',
    location: 'Профсоюзная',
    locationKind: 'street',
  },
  {
    id: 'federal-moscow-g-dot',
    input: 'г. Москва, проспект Вернадского, д. 12',
    shortTitle: 'Москва, Вернадского',
    city: 'Москва',
    location: 'Вернадского',
    locationKind: 'street',
  },
  {
    id: 'federal-spb-gorod',
    input: 'Санкт-Петербург Город, Невский проспект, д. 28',
    shortTitle: 'Санкт-Петербург, Невский проспект',
    city: 'Санкт-Петербург',
    location: 'Невский проспект',
    locationKind: 'street',
  },

  // --- Аналоги: область + г.о. + улица ---
  {
    id: 'oblast-go-street',
    input: 'Московская область, г.о. Химки, ул. Репина, д. 34',
    shortTitle: 'Химки, Репина',
    city: 'Химки',
    location: 'Репина',
    locationKind: 'street',
  },
  {
    id: 'oblast-go-city-dot',
    input: 'Тульская область, г. Тула, ул. Советская, д. 2',
    shortTitle: 'Тула, Советская',
    city: 'Тула',
    location: 'Советская',
    locationKind: 'street',
  },

  // --- Аналоги: улица — разный порядок слов ---
  {
    id: 'street-suffix-highway',
    input: 'Россия, Москва, шоссе Энтузиастов, д. 56',
    shortTitle: 'Москва, Энтузиастов',
    city: 'Москва',
    location: 'Энтузиастов',
    locationKind: 'street',
  },
  {
    id: 'street-suffix-name-first',
    input: 'Ленинградский проспект, д. 39, Москва',
    shortTitle: 'Москва, Ленинградский проспект',
    city: 'Москва',
    location: 'Ленинградский проспект',
    locationKind: 'street',
  },
  {
    id: 'street-suffix-ul-last',
    input: 'Красная площадь, ул., д. 1, Москва',
    shortTitle: 'Москва, д. 1',
    city: 'Москва',
    location: 'д. 1',
    locationKind: 'house',
  },

  // --- Аналоги: территория / поселок (без улицы) ---
  {
    id: 'territory-only',
    input: 'Московская область, г.о. Домодедово, территория промзона Восточная, д. 1',
    shortTitle: 'Домодедово, Промзона Восточная',
    city: 'Домодедово',
    location: 'Промзона Восточная',
    locationKind: 'territory',
  },
  {
    id: 'settlement-no-street',
    input: 'Ленинградская область, г.о. Всеволожск, поселок Мурино, д. 7',
    shortTitle: 'Всеволожск, Мурино',
    city: 'Всеволожск',
    location: 'Мурино',
    locationKind: 'settlement',
  },

  // --- Регрессии (известные ловушки) ---
  {
    id: 'regression-vn-ter-not-territory',
    input: 'Москва Город, вн. тер. г. муниципальный округ Внуково, д. 1А',
    shortTitle: 'Москва, Внуково',
    city: 'Москва',
    location: 'Внуково',
    locationKind: 'district',
  },
  {
    id: 'regression-shosse-not-osse',
    input: 'Санкт-Петербург, Горское шоссе, д. 6',
    shortTitle: 'Санкт-Петербург, Горское шоссе',
    city: 'Санкт-Петербург',
    location: 'Горское шоссе',
    locationKind: 'street',
  },
  {
    id: 'regression-sh-in-shosse-word',
    input: 'Москва, шоссе Дмитровское, д. 10',
    shortTitle: 'Москва, Дмитровское',
    city: 'Москва',
    location: 'Дмитровское',
    locationKind: 'street',
  },

  // --- Пустой / мусор ---
  {
    id: 'empty',
    input: '',
    shortTitle: null,
    city: null,
    location: null,
    locationKind: null,
  },
]
