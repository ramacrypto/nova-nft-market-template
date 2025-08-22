// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

contract Marketplace {
    struct Listing {
        uint256 id;
        address seller;
        address nft;
        uint256 tokenId;
        uint256 price;
        bool active;
    }

    uint256 private _nextId = 1;
    mapping(uint256 => Listing) public listings;
    mapping(address => uint256) public proceeds;

    event Listed(uint256 indexed id, address indexed seller, address indexed nft, uint256 tokenId, uint256 price);
    event Bought(uint256 indexed id, address indexed buyer);
    event Cancelled(uint256 indexed id);

    function listToken(address nft, uint256 tokenId, uint256 price) external {
        require(price > 0, "price=0");
        IERC721 token = IERC721(nft);
        require(token.ownerOf(tokenId) == msg.sender, "not owner");
        require(
            token.getApproved(tokenId) == address(this) || token.isApprovedForAll(msg.sender, address(this)),
            "not approved"
        );

        uint256 id = _nextId++;
        listings[id] = Listing({
            id: id,
            seller: msg.sender,
            nft: nft,
            tokenId: tokenId,
            price: price,
            active: true
        });

        emit Listed(id, msg.sender, nft, tokenId, price);
    }

    function buy(uint256 id) external payable {
        Listing storage lst = listings[id];
        require(lst.active, "not active");
        require(msg.value == lst.price, "price mismatch");

        lst.active = false;
        proceeds[lst.seller] += msg.value;
        IERC721(lst.nft).safeTransferFrom(lst.seller, msg.sender, lst.tokenId);

        emit Bought(id, msg.sender);
    }

    function getListings() external view returns (Listing[] memory all) {
        all = new Listing[](_nextId - 1);
        uint256 idx = 0;
        for (uint256 i = 1; i < _nextId; i++) {
            all[idx++] = listings[i];
        }
    }

    function withdrawProceeds() external {
        uint256 amount = proceeds[msg.sender];
        require(amount > 0, "no proceeds");
        proceeds[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "transfer fail");
    }

    function cancel(uint256 id) external {
        Listing storage lst = listings[id];
        require(lst.active, "not active");
        require(lst.seller == msg.sender, "not seller");
        lst.active = false;
        emit Cancelled(id);
    }
}
