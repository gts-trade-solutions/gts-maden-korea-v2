import React from 'react'
import InstagramMediaPanel from './InstagramMediaPanel'
import { AdminBackBar } from '@/components/admin/AdminBackBar'

const page = () => {
  return (
    <>
      <AdminBackBar title="Instagram Marketing" to="/admin" />
      <InstagramMediaPanel/>
    </>
  )
}

export default page
