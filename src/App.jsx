import React, { useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import abiJSON from './marketplaceABI.json'

// ======= CONFIG =======
// Ganti dengan alamat kontrak hasil deploy di testnet (Remix/Base Sepolia)
const MARKETPLACE_ADDRESS = import.meta.env.VITE_MARKETPLACE_ADDRESS || "0xYourMarketplaceAddress"
const RPC_URL = import.meta.env.VITE_RPC_URL || "https://sepolia.base.org"
// =======================

function useProviderSigner() {
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [address, setAddress] = useState(null)

  useEffect(() => {
    const eth = window.ethereum
    if (!eth) return

    const handleAccounts = async () => {
      const p = new ethers.BrowserProvider(eth)
      const s = await p.getSigner().catch(() => null)
      setProvider(p); setSigner(s)
      setAddress(s ? await s.getAddress() : null)
    }

    eth.on?.('accountsChanged', handleAccounts)
    handleAccounts()
    return () => eth.removeListener?.('accountsChanged', handleAccounts)
  }, [])

  const connect = async () => {
    if (!window.ethereum) return alert('Install MetaMask')
    await window.ethereum.request({ method: 'eth_requestAccounts' })
    const p = new ethers.BrowserProvider(window.ethereum)
    const s = await p.getSigner()
    setProvider(p); setSigner(s)
    setAddress(await s.getAddress())
  }

  const roProvider = useMemo(() => new ethers.JsonRpcProvider(RPC_URL), [])

  return { provider, signer, address, connect, roProvider }
}

function short(addr) {
  if (!addr) return ''
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

const defaultListing = { nft: '', tokenId: '', priceEth: '' }

export default function App() {
  const { signer, address, connect, roProvider } = useProviderSigner()
  const [listings, setListings] = useState([])
  const [form, setForm] = useState(defaultListing)
  const [proceeds, setProceeds] = useState('0')
  const [loading, setLoading] = useState(false)

  const marketRO = useMemo(() => new ethers.Contract(MARKETPLACE_ADDRESS, abiJSON.abi, roProvider), [roProvider])
  const marketRW = useMemo(() => signer ? new ethers.Contract(MARKETPLACE_ADDRESS, abiJSON.abi, signer) : null, [signer])

  async function refresh() {
    try {
      setLoading(true)
      const data = await marketRO.getListings()
      setListings(data.filter(x => x.active))
      if (address) {
        const p = await marketRO.proceeds(address)
        setProceeds(ethers.formatEther(p))
      }
    } catch (e) {
      console.error(e)
      alert('Gagal fetch listings, cek kontrak/RPC!')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [address])

  async function listToken(e) {
    e.preventDefault()
    if (!marketRW) return alert('Connect wallet dulu')
    const { nft, tokenId, priceEth } = form
    if (!nft || !tokenId || !priceEth) return alert('Lengkapi form')

    try {
      const tx = await marketRW.listToken(nft, BigInt(tokenId), ethers.parseEther(priceEth))
      await tx.wait()
      setForm(defaultListing)
      refresh()
    } catch (err) {
      console.error(err)
      alert('Gagal buat listing. Pastikan NFT di-approve ke marketplace.')
    }
  }

  async function buy(listingId, priceWei) {
    if (!marketRW) return alert('Connect wallet dulu')
    try {
      const tx = await marketRW.buy(listingId, { value: priceWei })
      await tx.wait()
      refresh()
    } catch (err) { console.error(err) }
  }

  async function withdraw() {
    if (!marketRW) return alert('Connect wallet dulu')
    try {
      const tx = await marketRW.withdrawProceeds()
      await tx.wait()
      refresh()
    } catch (err) { console.error(err) }
  }

  return (
    <div className="container">
      <nav className="nav">
        <div className="brand">NovaNFT <span className="badge">Template</span></div>
        <div>
          {address ? (
            <button className="btn mono">{short(address)}</button>
          ) : (
            <button className="btn" onClick={connect}>Connect Wallet</button>
          )}
        </div>
      </nav>

      <section className="hero">
        <h2>Jual–Beli NFT</h2>
        <form onSubmit={listToken}>
          <label>Alamat NFT</label>
          <input value={form.nft} onChange={e=>setForm({...form,nft:e.target.value})} placeholder="0x..." />
          <label>Token ID</label>
          <input value={form.tokenId} onChange={e=>setForm({...form,tokenId:e.target.value})} />
          <label>Harga (ETH)</label>
          <input value={form.priceEth} onChange={e=>setForm({...form,priceEth:e.target.value})} />
          <button className="btn" type="submit">List Token</button>
        </form>
        <div className="card" style={{marginTop:10}}>
          <h3>Saldo Penjualan</h3>
          <div>{proceeds} ETH</div>
          <button className="btn" onClick={withdraw}>Withdraw</button>
        </div>
      </section>

      <section>
        <h3>Listing Aktif</h3>
        <button className="btn" onClick={refresh}>{loading ? "Loading..." : "Refresh"}</button>
        <div className="grid">
          {listings.length === 0 && <div className="card">Belum ada listing.</div>}
          {listings.map(l => (
            <div key={Number(l.id)} className="card">
              <div>Token: {l.nft}</div>
              <div>ID: {String(l.tokenId)}</div>
              <div>Harga: {ethers.formatEther(l.price)} ETH</div>
              <button className="btn" onClick={()=>buy(l.id, l.price)}>Beli</button>
              <div>Penjual: {short(l.seller)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
