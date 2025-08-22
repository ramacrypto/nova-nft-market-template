import React, { useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import abiJSON from './marketplaceABI.json'

// ======= CONFIG =======
// Ganti dengan alamat kontrak hasil deploy
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

  // Minta user connect account
  await window.ethereum.request({ method: 'eth_requestAccounts' })

  // Cek jaringan
  const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' })
  const MONAD_CHAIN_ID = '0x4ebf' // contoh: 20143 desimal = 0x4ebf hex (ganti sesuai chainId Monad testnet)

  if (chainIdHex !== MONAD_CHAIN_ID) {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: MONAD_CHAIN_ID }],
      })
    } catch (switchError) {
      // Kalau jaringan belum ada di wallet → tambah
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: MONAD_CHAIN_ID,
            chainName: 'Monad Testnet',
            rpcUrls: ['https://rpc-mu.di-monad.org'],
            nativeCurrency: {
              name: 'MON',
              symbol: 'MON',
              decimals: 18
            }
          }]
        })
      }
    }
  }

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

// Form untuk ERC1155: nft address, tokenId, amount, price per unit (ETH)
const defaultListing = { nft: '', tokenId: '', amount: '', priceEth: '' }

export default function App() {
  const { signer, address, connect, roProvider } = useProviderSigner()
  const [listings, setListings] = useState([])
  const [form, setForm] = useState(defaultListing)
  const [proceeds, setProceeds] = useState('0')
  const [loading, setLoading] = useState(false)
  const [qtyInputs, setQtyInputs] = useState({}) // simpan qty per listingId

  const marketRO = useMemo(() => new ethers.Contract(MARKETPLACE_ADDRESS, abiJSON.abi, roProvider), [roProvider])
  const marketRW = useMemo(() => signer ? new ethers.Contract(MARKETPLACE_ADDRESS, abiJSON.abi, signer) : null, [signer])

  async function refresh() {
    try {
      setLoading(true)
      const data = await marketRO.getListings()
      // Listing ERC1155: { id, seller, token, tokenId, amountLeft, pricePerUnit, active }
      setListings(data.filter(x => x.active))
      if (address) {
        const p = await marketRO.proceeds(address)
        setProceeds(ethers.formatEther(p))
      }
    } catch (e) {
      console.error(e)
      alert('Gagal fetch listings, cek kontrak/RPC/ABI!')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [address])

  // === LISTING ERC1155 ===
  async function listToken1155(e) {
    e.preventDefault()
    if (!marketRW) return alert('Connect wallet dulu')

    const { nft, tokenId, amount, priceEth } = form
    if (!nft || !tokenId || !amount || !priceEth) return alert('Lengkapi form')

    try {
      const tx = await marketRW.list1155(
        nft,
        BigInt(tokenId),
        BigInt(amount),
        ethers.parseEther(priceEth) // harga per unit dalam ETH
      )
      await tx.wait()
      setForm(defaultListing)
      refresh()
    } catch (err) {
      console.error(err)
      alert('Gagal buat listing. Pastikan NFT ERC1155 sudah setApprovalForAll ke marketplace.')
    }
  }

  // === BELI ERC1155 (qty) ===
  async function buyQty(listing) {
    if (!marketRW) return alert('Connect wallet dulu')
    const id = listing.id
    const qtyStr = qtyInputs[id] || '1'
    const qty = BigInt(qtyStr)
    if (qty <= 0n) return alert('Qty harus > 0')

    try {
      // pricePerUnit & id dari kontrak biasanya bertipe bigint di ethers v6
      const cost = listing.pricePerUnit * qty
      const tx = await marketRW.buy(id, qty, { value: cost })
      await tx.wait()
      // reset qty input utk listing tsb
      setQtyInputs(prev => ({ ...prev, [id]: '' }))
      refresh()
    } catch (err) {
      console.error(err)
      alert('Gagal beli. Cek qty, saldo, atau approval.')
    }
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
        <div className="brand">NovaNFT <span className="badge">ERC1155</span></div>
        <div>
          {address ? (
            <button className="btn mono">{short(address)}</button>
          ) : (
            <button className="btn" onClick={connect}>Connect Wallet</button>
          )}
        </div>
      </nav>

      <section className="hero">
        <h2>Jual–Beli NFT (ERC-1155)</h2>
        <div className="pill" style={{marginBottom:12}}>Pastikan sudah setApprovalForAll ke marketplace</div>
        <form onSubmit={listToken1155}>
          <label>Alamat NFT (ERC1155)</label>
          <input value={form.nft} onChange={e=>setForm({...form,nft:e.target.value})} placeholder="0x..." />
          <label>Token ID</label>
          <input value={form.tokenId} onChange={e=>setForm({...form,tokenId:e.target.value})} inputMode="numeric" />
          <label>Amount (jumlah unit)</label>
          <input value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} inputMode="numeric" />
          <label>Harga per unit (ETH)</label>
          <input value={form.priceEth} onChange={e=>setForm({...form,priceEth:e.target.value})} inputMode="decimal" />
          <button className="btn" type="submit">List 1155</button>
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
          {listings.map(l => {
            const idNum = Number(l.id) // untuk key/label saja
            const priceEth = ethers.formatEther(l.pricePerUnit)
            const left = l.amountLeft?.toString?.() ?? String(l.amountLeft)
            return (
              <div key={idNum} className="card">
                <div><strong>ID Listing:</strong> {idNum}</div>
                <div><strong>Token (contract):</strong> {l.token}</div>
                <div><strong>Token ID:</strong> {String(l.tokenId)}</div>
                <div><strong>Price / unit:</strong> {priceEth} ETH</div>
                <div><strong>Sisa:</strong> {left}</div>
                <div style={{display:'flex', gap:8, marginTop:8}}>
                  <input
                    style={{flex:1}}
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={qtyInputs[l.id] || ''}
                    onChange={(e)=>setQtyInputs(prev=>({ ...prev, [l.id]: e.target.value }))}
                  />
                  <button className="btn" onClick={()=>buyQty(l)}>Beli</button>
                </div>
                <div style={{marginTop:8, color:'#9ca3af'}}>Penjual: {short(l.seller)}</div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
