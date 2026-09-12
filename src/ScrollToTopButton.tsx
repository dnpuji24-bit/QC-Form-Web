import { useEffect, useState } from 'react'

function portalScroller(){
  const element=document.querySelector<HTMLElement>('.portal-layer')
  return element&&element.scrollHeight>element.clientHeight?element:null
}

export default function ScrollToTopButton(){
  const[visible,setVisible]=useState(false)

  useEffect(()=>{
    let currentPortal:HTMLElement|null=null
    const update=()=>{
      const nextPortal=portalScroller()
      if(nextPortal!==currentPortal){
        currentPortal?.removeEventListener('scroll',update)
        currentPortal=nextPortal
        currentPortal?.addEventListener('scroll',update,{passive:true})
      }
      const portalTop=currentPortal?.scrollTop||0
      const windowTop=window.scrollY||document.documentElement.scrollTop||0
      setVisible(Math.max(portalTop,windowTop)>320)
    }

    update()
    window.addEventListener('scroll',update,{passive:true})
    const observer=new MutationObserver(update)
    observer.observe(document.body,{childList:true,subtree:true})

    return()=>{
      window.removeEventListener('scroll',update)
      currentPortal?.removeEventListener('scroll',update)
      observer.disconnect()
    }
  },[])

  if(!visible)return null

  function goTop(){
    const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const behavior:ScrollBehavior=reduceMotion?'auto':'smooth'
    const portal=portalScroller()
    if(portal&&portal.scrollTop>0){
      portal.scrollTo({top:0,left:0,behavior})
      return
    }
    window.scrollTo({top:0,left:0,behavior})
  }

  return <button
    type="button"
    onClick={goTop}
    aria-label="Kembali ke bagian atas"
    title="Ke atas"
    style={{
      position:'fixed',
      right:20,
      bottom:70,
      zIndex:10050,
      width:48,
      height:48,
      borderRadius:'50%',
      border:'1px solid rgba(255,255,255,.22)',
      background:'rgba(20,32,51,.96)',
      color:'#fff',
      display:'grid',
      placeItems:'center',
      fontSize:23,
      fontWeight:900,
      lineHeight:1,
      cursor:'pointer',
      boxShadow:'0 12px 30px rgba(16,24,40,.28)',
      backdropFilter:'blur(12px)',
      WebkitBackdropFilter:'blur(12px)',
    }}
  >↑</button>
}
