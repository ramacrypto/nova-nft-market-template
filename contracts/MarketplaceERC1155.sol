// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal ERC1155 interface yang kita butuhkan
interface IERC1155 {
    function balanceOf(address account, uint256 id) external view returns (uint256);
    function isApprovedForAll(address account, address operator) external view returns (bool);
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external;
}

contract MarketplaceERC1155 {
    struct Listing {
        uint256 id;            // id listing internal
        address seller;        // penjual
        address token;         // alamat kontrak ERC1155
        uint256 tokenId;       // token id
        uint256 amountLeft;    // sisa jumlah unit yg masih dijual
        uint256 pricePerUnit;  // harga per 1 unit (dalam wei)
        bool active;           // status aktif
    }

    // reentrancy guard sederhana
    uint256 private _unlocked = 1;
    modifier nonReentrant() {
        require(_unlocked == 1, "REENTRANCY");
        _unlocked = 0;
        _;
        _unlocked = 1;
    }

    uint256 private _nextId = 1;
    mapping(uint256 => Listing) public listings;
    mapping(address => uint256) public proceeds; // saldo hasil penjualan per penjual

    event Listed(
        uint256 indexed id,
        address indexed seller,
        address indexed token,
        uint256 tokenId,
        uint256 amount,
        uint256 pricePerUnit
    );
    event Bought(uint256 indexed id, address indexed buyer, uint256 qty, uint256 paid);
    event Cancelled(uint256 indexed id);
    event PriceUpdated(uint256 indexed id, uint256 newPricePerUnit);

    /// @notice Buat listing ERC1155.
    /// @param token Alamat kontrak ERC1155
    /// @param tokenId ID token
    /// @param amount Jumlah unit yang ingin dilisting
    /// @param pricePerUnit Harga per 1 unit (wei)
    function list1155(address token, uint256 tokenId, uint256 amount, uint256 pricePerUnit) external {
        require(amount > 0, "amount=0");
        require(pricePerUnit > 0, "price=0");
        IERC1155 erc = IERC1155(token);

        // Pastikan penjual punya stok cukup & sudah approve marketplace
        require(erc.balanceOf(msg.sender, tokenId) >= amount, "insufficient balance");
        require(erc.isApprovedForAll(msg.sender, address(this)), "not approved (setApprovalForAll)");

        uint256 id = _nextId++;
        listings[id] = Listing({
            id: id,
            seller: msg.sender,
            token: token,
            tokenId: tokenId,
            amountLeft: amount,
            pricePerUnit: pricePerUnit,
            active: true
        });

        emit Listed(id, msg.sender, token, tokenId, amount, pricePerUnit);
    }

    /// @notice Beli sebagian/seluruh qty dari sebuah listing.
    /// @param id ID listing
    /// @param qty Jumlah unit yang dibeli
    function buy(uint256 id, uint256 qty) external payable nonReentrant {
        Listing storage lst = listings[id];
        require(lst.active, "not active");
        require(qty > 0 && qty <= lst.amountLeft, "invalid qty");

        uint256 cost = qty * lst.pricePerUnit;
        require(msg.value == cost, "price mismatch");

        // efek sebelum interaksi
        lst.amountLeft -= qty;
        if (lst.amountLeft == 0) {
            lst.active = false;
        }
        proceeds[lst.seller] += msg.value;

        // transfer token dari seller -> buyer
        IERC1155(lst.token).safeTransferFrom(lst.seller, msg.sender, lst.tokenId, qty, "");

        emit Bought(id, msg.sender, qty, msg.value);
    }

    /// @notice Ubah harga per unit (hanya seller & listing aktif).
    function updatePrice(uint256 id, uint256 newPricePerUnit) external {
        Listing storage lst = listings[id];
        require(lst.active, "not active");
        require(msg.sender == lst.seller, "not seller");
        require(newPricePerUnit > 0, "price=0");
        lst.pricePerUnit = newPricePerUnit;
        emit PriceUpdated(id, newPricePerUnit);
    }

    /// @notice Batalkan listing (sisa qty tidak dipindahkan ke mana-mana).
    function cancel(uint256 id) external {
        Listing storage lst = listings[id];
        require(lst.active, "not active");
        require(msg.sender == lst.seller, "not seller");
        lst.active = false;
        emit Cancelled(id);
    }

    /// @notice Tarik saldo hasil penjualan.
    function withdrawProceeds() external nonReentrant {
        uint256 amount = proceeds[msg.sender];
        require(amount > 0, "no proceeds");
        proceeds[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "transfer fail");
    }

    /// @notice Ambil semua listing (untuk keperluan front-end sederhana).
    function getListings() external view returns (Listing[] memory all) {
        if (_nextId == 1) return all;
        all = new Listing[](_nextId - 1);
        uint256 j = 0;
        for (uint256 i = 1; i < _nextId; i++) {
            all[j++] = listings[i];
        }
    }
}
