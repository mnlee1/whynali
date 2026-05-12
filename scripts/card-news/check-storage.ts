/**
 * Supabase Storage 버킷 확인 및 생성 스크립트
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function checkAndCreateBucket() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    console.log('🔍 Supabase Storage 버킷 확인 중...')

    // 1. 기존 버킷 목록 조회
    const { data: buckets, error: listError } = await supabase.storage.listBuckets()

    if (listError) {
        console.error('❌ 버킷 목록 조회 실패:', listError.message)
        return
    }

    console.log('\n✅ 현재 버킷 목록:')
    buckets.forEach((bucket) => {
        console.log(`   - ${bucket.name} (${bucket.public ? 'public' : 'private'})`)
    })

    // 2. public 버킷 존재 여부 확인
    const publicBucket = buckets.find((b) => b.name === 'public')

    if (publicBucket) {
        console.log('\n✅ "public" 버킷이 이미 존재합니다.')
        return
    }

    // 3. public 버킷 생성
    console.log('\n📦 "public" 버킷 생성 중...')

    const { data, error } = await supabase.storage.createBucket('public', {
        public: true,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
        fileSizeLimit: 10485760, // 10MB
    })

    if (error) {
        console.error('❌ 버킷 생성 실패:', error.message)
        return
    }

    console.log('✅ "public" 버킷 생성 완료!')
    console.log('   - 버킷 이름: public')
    console.log('   - 공개 읽기: 활성화')
    console.log('   - 허용 파일: image/png, image/jpeg, image/jpg, image/webp')
    console.log('   - 최대 크기: 10MB')
}

checkAndCreateBucket().catch((err) => {
    console.error('❌ 오류:', err.message)
    process.exit(1)
})
