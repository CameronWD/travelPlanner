"use client";

import * as React from "react";

interface TripCurrencies {
  homeCurrency: string;
  currencies: readonly string[];
}

const TripCurrenciesContext = React.createContext<TripCurrencies | null>(null);

export function TripCurrenciesProvider({
  homeCurrency,
  currencies,
  children,
}: TripCurrencies & { children: React.ReactNode }) {
  const value = React.useMemo(() => ({ homeCurrency, currencies }), [homeCurrency, currencies]);
  return <TripCurrenciesContext.Provider value={value}>{children}</TripCurrenciesContext.Provider>;
}

export function useTripCurrencies(): TripCurrencies | null {
  return React.useContext(TripCurrenciesContext);
}
