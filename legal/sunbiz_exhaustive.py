#!/usr/bin/env python3
"""Exhaustive Sunbiz search — every possible name the Philosopher might have used."""
import sys
sys.path.insert(0, '/Users/rnir_hrc_avd/Library/Python/3.9/lib/python/site-packages')

from playwright.sync_api import sync_playwright

def search():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )

        # Every possible entity name
        names = [
            'Apex',
            'Apex Cloud',
            'Apex Avli',
            'Avalia',
            'Avalia Cloud',
            'Valido',
            'Valido Cloud',
            'L7',
            'L7 Way',
            'L7 Cloud',
            'Emerald',
            'Emerald Tablet',
            'Prima',
            'Valhalla',
            'Newdawn',
            'New Dawn',
            'Malkuth',
            'Philosopher',
            'Great Work',
            'Forge',
            'City Bird',
            'Lapis',
            'Transmutation',
            'Dodecahedron',
            'Astrocyte',
            'IQS',
            'IQS 888',
            'Rubedo',
            'Citrinitas',
            'Albedo',
            'Nigredo',
            'Opus',
            'Opus Cloud',
            'Craft',
            'Craft L7',
            'L7Way',
            'L7 Way',
            'Avli',
            'Cloud Avli',
            'Alberto Valido',
            'Valido Delgado',
            'Avalia Cloud',
            'Avalia',
        ]

        for name in names:
            page.goto('https://search.sunbiz.org/Inquiry/CorporationSearch/ByName')
            page.wait_for_load_state('networkidle')
            si = page.query_selector('#SearchTerm')
            si.fill(name)
            page.click('input[type="submit"], button[type="submit"]')
            page.wait_for_load_state('networkidle')

            results = page.query_selector_all('a[href*="SearchResultDetail"]')
            hits = []
            if results:
                for r in results[:5]:
                    text = r.inner_text().strip()
                    # Only show exact or very close matches
                    if name.upper().split()[0] in text.upper():
                        hits.append(text)

            if hits:
                print(f"{name}:")
                for h in hits:
                    print(f"  -> {h}")
            else:
                print(f"{name}: (no close match)")

        # Now search officer/RA for Alberto, Valido, Delgado
        print("\n" + "=" * 50)
        print("OFFICER/RA SEARCHES")
        print("=" * 50)

        officer_terms = [
            'Alberto Valido',
            'Valido Alberto',
            'Valido, Alberto',
            'Delgado Alberto',
            'Delgado, Alberto',
        ]

        for term in officer_terms:
            page.goto('https://search.sunbiz.org/Inquiry/CorporationSearch/ByOfficerOrRegisteredAgent')
            page.wait_for_load_state('networkidle')
            si = page.query_selector('#SearchTerm')
            if si:
                si.fill(term)
                page.click('input[type="submit"], button[type="submit"]')
                page.wait_for_load_state('networkidle')
                results = page.query_selector_all('a[href*="SearchResultDetail"]')
                if results:
                    print(f"\n{term}:")
                    for r in results[:15]:
                        text = r.inner_text().strip()
                        print(f"  -> {text}")
                else:
                    print(f"{term}: (no results)")

        browser.close()

if __name__ == '__main__':
    search()
