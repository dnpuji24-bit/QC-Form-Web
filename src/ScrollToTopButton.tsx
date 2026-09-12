import { useEffect, useState } from 'react'

export default function ScrollToTopButton(){
  const[visible,setVisible]=useState(false)

  useEffect(()=>{
    const update=()=>setVisible(window.scrollY>420)
    update()
    window.addEventListener('scroll',update,{passive:true})
    return()=>window.removeEventListener('scroll',update)
  },[])

  if(!visible)return null

  function goTop(){
    const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({top:0,left:0,behavior:reduceMotion?'auto':'smooth'})
  }

  return <button
    type="button"
    onClick={goTop}
    aria-label="Kembali ke bagian atas"
    title="Ke atas"
    style={{
      position:'fixed',
      right:18,
      bottom:68,
      zIndex:70,
      width:46,
      height:46,
      borderRadius:'50%',
      border:'1px solid rgba(255,255,255,.18)',
      background:'rgba(20,32,51,.94)',
      color:'#fff',
      display:'grid',
      placeItems:'center',
      fontSize:22,
      fontWeight:900,
      lineHeight:1,
      cursor:'pointer',
      boxShadow:'0 10px 30px rgba(16,24,40,.22)',
      backdropFilter:'blur(12px)',
      WebkitBackdropFilter:'blur(12px)',
    }}
  >↑</button>
}
