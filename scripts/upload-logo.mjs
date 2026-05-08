import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('환경 변수 필요: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function uploadLogo() {
    const logoPath = path.join(__dirname, '../public/whynali-logo.png')
    const fileBuffer = fs.readFileSync(logoPath)

    console.log('로고 업로드 중...')

    const { data, error } = await supabase.storage
        .from('public')
        .upload('whynali-logo.png', fileBuffer, {
            contentType: 'image/png',
            upsert: true,
        })

    if (error) {
        console.error('업로드 실패:', error)
        process.exit(1)
    }

    const { data: urlData } = supabase.storage.from('public').getPublicUrl('whynali-logo.png')

    console.log('✅ 업로드 완료!')
    console.log('Public URL:', urlData.publicUrl)
    console.log('\n.env에 추가:')
    console.log(`WHYNALI_LOGO_URL=${urlData.publicUrl}`)
}

uploadLogo()
