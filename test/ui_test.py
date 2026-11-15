import asyncio, os
from playwright.async_api import async_playwright
OUT='test/shots'; os.makedirs(OUT, exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, accept_downloads=True)
        pg = await ctx.new_page()
        errs=[]; pg.on('console', lambda m: errs.append(m.text) if m.type in ('error','warning') else None); pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto('http://localhost:8766/'); await pg.wait_for_timeout(600)
        await pg.screenshot(path=OUT+'/1-valinta.png')
        for typ in ['kunto','osto','muutto']:
            await pg.click(f'[data-a=pick][data-v={typ}]'); await pg.wait_for_timeout(200)
            await pg.fill('[data-p="meta/osoite"]', f'Testikatu 1 A 2 ({typ})')
            await pg.set_input_files('[data-photos=cover]', 'test/photo.jpg'); await pg.wait_for_timeout(800)
            await pg.click('[data-a=cat] >> nth=0'); await pg.wait_for_timeout(100)
            await pg.click('.li >> nth=0 >> .chip >> nth=0')
            await pg.click('.li >> nth=1 >> .chip >> nth=2'); await pg.wait_for_timeout(100)
            await pg.fill('.li >> nth=1 >> textarea', 'Korjattava asia')
            await pg.fill('[data-title]', 'Ensimmäinen havainto')
            await pg.fill('[data-p$="/ehdotus"] >> nth=0', 'Korjataan')
            if typ!='kunto': await pg.fill('.cost >> nth=0', '1200')
            if typ=='muutto':
                c = pg.locator('canvas[data-sig]').first; bb = await c.bounding_box()
                await pg.mouse.move(bb['x']+20, bb['y']+80); await pg.mouse.down()
                for i in range(10): await pg.mouse.move(bb['x']+20+i*25, bb['y']+60+(i%3)*20)
                await pg.mouse.up(); await pg.wait_for_timeout(200)
            await pg.screenshot(path=OUT+f'/2-{typ}.png', full_page=True)
            await pg.click('[data-a=tab][data-v=mittaukset]'); await pg.wait_for_timeout(100)
            await pg.fill('[data-p$="/t"] >> nth=0', '21') if await pg.locator('[data-p$="/t"]').count() else None
            await pg.fill('[data-p$="/rh"] >> nth=0', '40') if await pg.locator('[data-p$="/rh"]').count() else None
            await pg.screenshot(path=OUT+f'/3-mitt-{typ}.png')
            await pg.click('[data-a=save]'); await pg.wait_for_timeout(400)
            await pg.screenshot(path=OUT+f'/4-vienti-{typ}.png')
            for f in ['pdf','docx','json']:
                async with pg.expect_download() as d:
                    await pg.click(f'[data-x=dl][data-f={f}]')
                dl = await d.value; await dl.save_as(OUT+'/'+dl.suggested_filename); print('download', dl.suggested_filename)
            await pg.click('[data-x=close]')
            await pg.click('[data-a=new]'); await pg.wait_for_timeout(200)
        await pg.reload(); await pg.wait_for_timeout(600)
        await pg.click('[data-a=tab][data-v=raportit]'); await pg.wait_for_timeout(200)
        await pg.screenshot(path=OUT+'/5-raportit.png')
        await pg.click('.rmain >> nth=0'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT+'/6-esikatselu.png', full_page=True)
        await pg.click('[data-a=back]'); await pg.wait_for_timeout(100)
        await pg.set_input_files('[data-import]', 'test/out/kmu.json') if os.path.exists('test/out/kmu.json') else None
        await pg.wait_for_timeout(300)
        print('reports', await pg.locator('.rmain').count())
        await pg.click('[data-a=tab][data-v=ohje]'); await pg.screenshot(path=OUT+'/7-ohje.png')
        print('ERRORS', errs)
        await b.close()
asyncio.run(main())
